// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The client records' command surface: a client's own entries, each of which may
//! carry one file (client request).
//!
//! Files cross the IPC boundary exactly as a statement's attachment does: the
//! bytes are the **raw body** and the record's fields ride in a header
//! (`x-record-meta`), so a large file is never JSON-encoded.

use crate::commands::error::{CommandError, ErrorKind};
use crate::files;
use crate::state::AppState;
use crate::store::client_records::{
    self, NewRecord, Record, RecordAttachmentAction, RecordUpdate,
};
use crate::store::object_cache::Scope;
use serde::Deserialize;
use std::collections::BTreeMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Where a record's own fields travel when the body is occupied by a file.
const META_HEADER: &str = "x-record-meta";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The same rules the form enforces, applied again at the boundary. `cnic` is
/// `None` on an edit — a record's client is fixed at creation and never changes.
fn problems(cnic: Option<&str>, name: &str, date: &str) -> BTreeMap<String, String> {
    let mut fields = BTreeMap::new();
    if let Some(cnic) = cnic {
        if cnic.trim().is_empty() {
            fields.insert("cnic".to_string(), "Choose the client for this record.".to_string());
        }
    }
    if name.trim().is_empty() {
        fields.insert("name".to_string(), "Enter a name for this record.".to_string());
    }
    if !is_iso_date(date) {
        fields.insert("date".to_string(), "Choose a valid date.".to_string());
    }
    fields
}

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

fn is_raw(request: &Request<'_>) -> bool {
    matches!(request.body(), InvokeBody::Raw(_))
}

fn meta_from<T: serde::de::DeserializeOwned>(request: &Request<'_>) -> Result<T, CommandError> {
    let raw = request
        .headers()
        .get(META_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            CommandError::io("The details of this record did not arrive with the file.")
        })?;
    serde_json::from_str(raw).map_err(|error| {
        CommandError::io(format!("The details of this record could not be read: {error}"))
    })
}

fn body_bytes(request: &Request<'_>) -> Vec<u8> {
    match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => Vec::new(),
    }
}

fn json_body(request: &Request<'_>) -> serde_json::Value {
    match request.body() {
        InvokeBody::Json(value) => value.clone(),
        InvokeBody::Raw(_) => serde_json::Value::Null,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMeta {
    input: NewRecord,
    file_name: Option<String>,
    #[serde(default)]
    content_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateJson {
    input: NewRecord,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateJson {
    update: RecordUpdate,
}

/// Every record belonging to one client, newest first (file names only).
#[tauri::command]
pub async fn list_client_records(
    state: State<'_, AppState>,
    cnic: String,
) -> Result<Vec<Record>, CommandError> {
    crate::log_info!("-> list_client_records {cnic}");
    let result = state
        .with_connection(|session| async move { client_records::list(&session.conn, &cnic).await })
        .await;
    if let Ok(ref records) = result {
        crate::log_debug!("list_client_records: {} returned", records.len());
    }
    crate::commands::log_outcome("list_client_records", &result);
    result
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record an entry for a client, carrying its file when one was given.
#[tauri::command]
pub async fn create_client_record(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Record, CommandError> {
    crate::log_info!("-> create_client_record");
    let result = apply_create_client_record(app, state, request).await;
    crate::commands::log_outcome("create_client_record", &result);
    result
}

async fn apply_create_client_record(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Record, CommandError> {
    // Parse first, but move the file only after the values are checked, so a
    // rejected record cannot leave an orphaned object behind.
    let (input, raw_file) = if is_raw(&request) {
        let meta: CreateMeta = meta_from(&request)?;
        let bytes = body_bytes(&request);
        (
            meta.input,
            meta.file_name
                .map(|name| (name, meta.content_type, bytes)),
        )
    } else {
        let json: CreateJson = serde_json::from_value(json_body(&request))
            .map_err(|error| CommandError::io(format!("The record could not be read: {error}")))?;
        (json.input, None)
    };

    let fields = problems(Some(&input.cnic), &input.name, &input.date);
    if !fields.is_empty() {
        return Err(CommandError::validation_for("record", fields));
    }

    // The file is kept locally; the upload rides the next drain, so a large file
    // never holds the record's own write up.
    let attachment = match raw_file {
        Some((name, content_type, bytes)) => Some(
            files::store_file(&state.cache, Scope::Record, &name, content_type.as_deref(), &bytes)
                .await?,
        ),
        None => None,
    };

    let created = state
        .with_connection(|session| async move {
            client_records::create(&session.conn, &input, attachment.as_ref()).await
        })
        .await?;

    crate::cloud::sync_state::mark_dirty(&app);
    crate::log_info!("create_client_record: stored as {}", created.id);
    Ok(created)
}

/// Correct a stored record in place. A replacement file arrives as the raw body.
#[tauri::command]
pub async fn update_client_record(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Record, CommandError> {
    crate::log_info!("-> update_client_record");
    let result = apply_update_client_record(app, state, request).await;
    crate::commands::log_outcome("update_client_record", &result);
    result
}

async fn apply_update_client_record(
    app: AppHandle,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> Result<Record, CommandError> {
    let mut update: RecordUpdate = if is_raw(&request) {
        meta_from::<UpdateJson>(&request)?.update
    } else {
        serde_json::from_value::<UpdateJson>(json_body(&request))
            .map_err(|error| CommandError::io(format!("The edit could not be read: {error}")))?
            .update
    };

    // Validate before touching the file, so a rejected edit cannot leave an
    // orphaned object behind.
    let fields = problems(None, &update.name, &update.date);
    if !fields.is_empty() {
        return Err(CommandError::validation_for("record", fields));
    }

    if let RecordAttachmentAction::Replace {
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
            files::store_file(&state.cache, Scope::Record, file_name, content_type.as_deref(), &incoming)
                .await?,
        );
    }

    let updated = state
        .with_connection(|session| async move {
            client_records::update(&session.conn, &update).await
        })
        .await?;

    crate::cloud::sync_state::mark_dirty(&app);
    Ok(updated)
}

/// Delete a record and its file (the confirmation is a UI responsibility).
#[tauri::command]
pub async fn delete_client_record(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    crate::log_info!("-> delete_client_record {id}");
    let config = state.object_storage();

    // Read the file reference first: the row cascades away with the record.
    let lookup_id = id.clone();
    let reference = state
        .with_connection(|session| async move {
            client_records::reference_opt(&session.conn, &lookup_id).await
        })
        .await
        .ok()
        .flatten();

    let result = state
        .with_connection(|session| async move { client_records::delete(&session.conn, &id).await })
        .await;
    if result.is_ok() {
        if let Some(reference) = reference {
            files::remove_object(config.as_ref(), &state.cache, &reference.object_key).await;
        }
        crate::cloud::sync_state::mark_dirty(&app);
    }
    crate::commands::log_outcome("delete_client_record", &result);
    result
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Write a record's file out to this run's temporary folder and hand it to the OS.
#[tauri::command]
pub async fn open_client_record_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    crate::log_info!("-> open_client_record_file {id}");
    let result = apply_open_client_record_file(app, state, id).await;
    crate::commands::log_outcome("open_client_record_file", &result);
    result
}

async fn apply_open_client_record_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    let reference = state
        .with_connection(|session| async move { client_records::reference(&session.conn, &id).await })
        .await?;

    let bytes = files::fetch_bytes(
        state.object_storage().as_ref(),
        &state.cache,
        Some(&app),
        Scope::Record,
        &reference.object_key,
        &reference.file_name,
        reference.content_type.as_deref(),
    )
    .await?;

    let path = crate::temp::write_out(&state.run_folder, &reference.file_name, &bytes)
        .map_err(|message| CommandError::new(ErrorKind::AttachmentWriteFailed, message))?;

    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| {
            CommandError::new(
                ErrorKind::AttachmentOpenFailed,
                format!(
                    "Nothing on this machine would open that kind of file, so it could not be \
                     displayed ({error}). You can still save a copy of it."
                ),
            )
        })
}

/// Save a copy of a record's file wherever the practitioner chooses.
#[tauri::command]
pub async fn save_client_record_file_copy(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, CommandError> {
    crate::log_info!("-> save_client_record_file_copy {id}");
    let result = apply_save_client_record_file_copy(app, state, id).await;
    crate::commands::log_outcome("save_client_record_file_copy", &result);
    result
}

async fn apply_save_client_record_file_copy(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, CommandError> {
    let reference = state
        .with_connection(|session| async move { client_records::reference(&session.conn, &id).await })
        .await?;

    let bytes = files::fetch_bytes(
        state.object_storage().as_ref(),
        &state.cache,
        Some(&app),
        Scope::Record,
        &reference.object_key,
        &reference.file_name,
        reference.content_type.as_deref(),
    )
    .await?;

    let chosen = app
        .dialog()
        .file()
        .set_file_name(&reference.file_name)
        .blocking_save_file();

    let Some(selected) = chosen else {
        crate::log_info!("save_client_record_file_copy: cancelled");
        return Ok(None);
    };

    let destination = selected
        .into_path()
        .map_err(|error| CommandError::io(format!("That location cannot be used: {error}")))?;

    std::fs::write(&destination, &bytes).map_err(|error| {
        CommandError::new(
            ErrorKind::AttachmentWriteFailed,
            format!("The copy could not be written: {error}"),
        )
    })?;

    Ok(Some(destination.to_string_lossy().to_string()))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
