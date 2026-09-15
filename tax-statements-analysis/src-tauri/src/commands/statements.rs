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

use crate::commands::error::CommandError;
use crate::state::AppState;
use crate::store::attachments::AttachmentPayload;
use crate::store::statements::{
    self, AttachmentAction, NewStatement, Statement, StatementUpdate,
};
use serde::Deserialize;
use std::collections::BTreeMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

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
pub fn create_statement(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Statement, CommandError> {
    let (input, attachment) = if is_raw(&request) {
        let meta: CreateMeta = meta_from(&request)?;
        let file_name = meta.file_name.clone();
        (meta.input, file_name.map(|name| AttachmentPayload {
            file_name: name,
            bytes: body_bytes(&request),
        }))
    } else {
        let json: CreateJson = serde_json::from_value(json_body(&request)).map_err(|error| {
            CommandError::io(format!("The statement could not be read: {error}"))
        })?;
        (json.input, None)
    };

    let fields = problems(&input.date, &input.kind, &input.nature, input.amount);
    if !fields.is_empty() {
        return Err(CommandError::validation(fields));
    }

    state.with_connection(|conn| statements::create(conn, &input, attachment.as_ref()))
}

/// Every statement dated inside the range, newest first. Carries file **names**
/// only — no attachment content is read at all, however large the files are
/// (FR-027, FR-029, SC-011).
#[tauri::command]
pub fn list_statements(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<Statement>, CommandError> {
    state.with_connection(|conn| statements::list_range(conn, &from, &to))
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
pub fn update_statement(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Statement, CommandError> {
    let mut update: StatementUpdate = if is_raw(&request) {
        meta_from::<UpdateJson>(&request)?.update
    } else {
        serde_json::from_value::<UpdateJson>(json_body(&request))
            .map_err(|error| CommandError::io(format!("The edit could not be read: {error}")))?
            .update
    };

    // A replacement file's contents arrived in the raw body, never in the meta.
    if let AttachmentAction::Replace { bytes, .. } = &mut update.attachment {
        let incoming = body_bytes(&request);
        if incoming.is_empty() {
            return Err(CommandError::io(
                "The replacement file's contents did not arrive with the edit.",
            ));
        }
        *bytes = incoming;
    }
    let fields = problems(
        &update.date,
        &update.kind,
        &update.nature,
        update.amount,
    );
    if !fields.is_empty() {
        return Err(CommandError::validation(fields));
    }

    state.with_connection(|conn| statements::update(conn, &update))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
