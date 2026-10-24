// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Recording, reviewing and correcting statements.
//!
//! **How a file's contents cross the IPC boundary.** They never travel as JSON.
//! When a statement carries an attachment the frontend sends the bytes as a
//! *raw request body* and puts the statement's fields in a header
//! (`x-statement-meta`), so a 50 MB scan is never expanded into an array of
//! decimal numbers — see Tauri's "Accessing Raw Request", and research R13.
//! When there is no file, the call is ordinary JSON, because there is nothing to
//! protect.
//!
//! Module 4 makes every command `async` (research R3); names, arguments and
//! results are unchanged.

use crate::commands::error::CommandError;
use crate::files;
use crate::state::AppState;
use crate::store::object_cache::Scope;
use crate::store::statements::{
    self, AttachmentAction, NewStatement, Statement, StatementUpdate,
};
use serde::Deserialize;
use std::collections::BTreeMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State};

/// Where the statement's own fields travel when the body is occupied by a file.
const META_HEADER: &str = "x-statement-meta";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The same validity rules the form already enforces, applied again at the
/// boundary, so "nothing invalid is ever written" holds even if the form's guard
/// is bypassed (FR-013, FR-044).
fn problems(date: &str, kind: &str, nature: &str, amount: f64) -> BTreeMap<String, String> {
    let mut fields = BTreeMap::new();

    if !is_iso_date(date) {
        fields.insert("date".to_string(), "Choose a valid date.".to_string());
    }
    if kind != "inflow" && kind != "outflow" {
        fields.insert("type".to_string(), "Choose In-Flow or Out-Flow.".to_string());
    }
    if nature.trim().is_empty() {
        fields.insert("nature".to_string(), "Choose a nature.".to_string());
    }
    if !amount.is_finite() || amount <= 0.0 {
        fields.insert(
            "amount".to_string(),
            "Enter an amount greater than zero.".to_string(),
        );
    }

    fields
}

/// `YYYY-MM-DD`, checked by shape. The store only ever compares these as text,
/// and the form's picker supplies real dates.
fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
}

/// Whether this request carries a file, and therefore whether its fields came in
/// a header rather than the body.
fn is_raw(request: &Request<'_>) -> bool {
    matches!(request.body(), InvokeBody::Raw(_))
}

fn meta_from<T: serde::de::DeserializeOwned>(request: &Request<'_>) -> Result<T, CommandError> {
    let raw = request
        .headers()
        .get(META_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            CommandError::io("The details of this statement did not arrive with the file.")
        })?;

    serde_json::from_str(raw).map_err(|error| {
        CommandError::io(format!("The details of this statement could not be read: {error}"))
    })
}

fn body_bytes(request: &Request<'_>) -> Vec<u8> {
    match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => Vec::new(),
    }
}

/// The structured part of an ordinary JSON call. A raw call carries its fields in
/// the meta header instead, so this yields `null` and the caller reports it.
fn json_body(request: &Request<'_>) -> serde_json::Value {
    match request.body() {
        InvokeBody::Json(value) => value.clone(),
        InvokeBody::Raw(_) => serde_json::Value::Null,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMeta {
    input: NewStatement,
    file_name: Option<String>,
    #[serde(default)]
    content_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateJson {
    input: NewStatement,
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record a statement. Resolves only once the write has completed, so the form
/// can never report success for a statement that was not stored (FR-001, FR-005).
#[tauri::command]
pub async fn create_statement(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Statement, CommandError> {
    crate::log_info!("-> create_statement");
    let result = apply_create_statement(app, state, request).await;
    crate::commands::log_outcome("create_statement", &result);
    result
}

async fn apply_create_statement(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Statement, CommandError> {
    let config = state.object_storage();

    // Parse the request first, but **do not** move the file's bytes yet: the
    // values are checked below, and a rejected statement must not leave an
    // orphaned object in the store or in Oracle.
    let (input, raw_file) = if is_raw(&request) {
        let meta: CreateMeta = meta_from(&request)?;
        let bytes = body_bytes(&request);
        (
            meta.input,
            meta.file_name
                .map(|name| (name, meta.content_type, bytes)),
        )
    } else {
        let json: CreateJson = serde_json::from_value(json_body(&request)).map_err(|error| {
            CommandError::io(format!("The statement could not be read: {error}"))
        })?;
        (json.input, None)
    };

    crate::log_info!(
        "create_statement: {} statement '{}' amount={}{}",
        input.kind,
        input.nature,
        input.amount,
        if raw_file.is_some() { ", with a file" } else { "" }
    );

    let fields = problems(&input.date, &input.kind, &input.nature, input.amount);
    if !fields.is_empty() {
        crate::log_warn!(
            "create_statement: validation failed on {:?}",
            fields.keys().collect::<Vec<_>>()
        );
        return Err(CommandError::validation(fields));
    }

    // Valid. Now record the file (cache-first) and keep its reference.
    let attachment = match raw_file {
        Some((name, content_type, bytes)) => Some(
            files::store_file(
                config.as_ref(),
                &state.cache,
                Scope::Statement,
                &name,
                content_type.as_deref(),
                &bytes,
            )
            .await?,
        ),
        None => None,
    };

    let created = state
        .with_connection(|session| async move {
            statements::create(&session.conn, &input, attachment.as_ref()).await
        })
        .await?;

    // There are now un-pushed changes on this machine (R8, FR-025).
    crate::cloud::sync_state::mark_dirty(&app);
    crate::log_info!("create_statement: stored as {}", created.id);
    Ok(created)
}

/// Every statement dated inside the range, newest first. Carries file **names**
/// only — no attachment content is read at all, however large the files are
/// (FR-027, FR-029, SC-011).
#[tauri::command]
pub async fn list_statements(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<Statement>, CommandError> {
    crate::log_info!("-> list_statements from={from} to={to}");
    let result = state
        .with_connection(|session| async move {
            statements::list_range(&session.conn, &from, &to).await
        })
        .await;
    if let Ok(ref statements) = result {
        crate::log_debug!("list_statements: {} returned", statements.len());
    }
    crate::commands::log_outcome("list_statements", &result);
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateJson {
    update: StatementUpdate,
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Correct a stored statement in place — it keeps its identity, and no second
/// record is created (FR-042).
///
/// As with creation: a replacement file arrives as the raw body with the edit in
/// the header, so its contents are never JSON-encoded.
#[tauri::command]
pub async fn update_statement(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Statement, CommandError> {
    crate::log_info!("-> update_statement");
    let result = apply_update_statement(app, state, request).await;
    crate::commands::log_outcome("update_statement", &result);
    result
}

async fn apply_update_statement(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Statement, CommandError> {
    let config = state.object_storage();

    let mut update: StatementUpdate = if is_raw(&request) {
        meta_from::<UpdateJson>(&request)?.update
    } else {
        serde_json::from_value::<UpdateJson>(json_body(&request))
            .map_err(|error| CommandError::io(format!("The edit could not be read: {error}")))?
            .update
    };

    // Validate before touching the file, so a rejected edit cannot leave an
    // orphaned object behind (see the note in `apply_create_statement`).
    let fields = problems(
        &update.date,
        &update.kind,
        &update.nature,
        update.amount,
    );
    if !fields.is_empty() {
        crate::log_warn!(
            "update_statement: validation failed on {:?}",
            fields.keys().collect::<Vec<_>>()
        );
        return Err(CommandError::validation(fields));
    }

    // A replacement file's contents arrived in the raw body, never in the meta.
    // They are written to the object store (cache first) here, and the reference
    // the store records is returned.
    if let AttachmentAction::Replace {
        file_name,
        content_type,
        reference,
    } = &mut update.attachment
    {
        let incoming = body_bytes(&request);
        if incoming.is_empty() {
            return Err(CommandError::io(
                "The replacement file's contents did not arrive with the edit.",
            ));
        }
        *reference = Some(
            files::store_file(
                config.as_ref(),
                &state.cache,
                Scope::Statement,
                file_name,
                content_type.as_deref(),
                &incoming,
            )
            .await?,
        );
    }

    crate::log_info!("update_statement: correcting statement {}", update.id);
    let updated = state
        .with_connection(|session| async move {
            statements::update(&session.conn, &update).await
        })
        .await?;

    crate::cloud::sync_state::mark_dirty(&app);
    crate::log_info!("update_statement: saved {}", updated.id);
    Ok(updated)
}

/// Delete a statement and its attachment (client request). The practitioner's
/// confirmation is a UI responsibility; this removes it once invoked.
#[tauri::command]
pub async fn delete_statement(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    crate::log_info!("-> delete_statement {id}");
    let result = apply_delete_statement(app, state, id).await;
    crate::commands::log_outcome("delete_statement", &result);
    result
}

async fn apply_delete_statement(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    crate::log_info!("delete_statement: removing {id}");
    let config = state.object_storage();

    // Read the file reference first: once the statement is gone its attachment
    // row cascades away and the object key would be lost.
    let lookup_id = id.clone();
    let reference = state
        .with_connection(|session| async move {
            crate::store::attachments::reference_opt(&session.conn, &lookup_id).await
        })
        .await?;

    state
        .with_connection(|session| async move { statements::delete(&session.conn, &id).await })
        .await?;

    // The bytes go too: the local cache row and (best-effort) the Oracle object.
    if let Some(reference) = reference {
        files::remove_object(config.as_ref(), &state.cache, &reference.object_key).await;
    }

    crate::cloud::sync_state::mark_dirty(&app);
    Ok(())
}
