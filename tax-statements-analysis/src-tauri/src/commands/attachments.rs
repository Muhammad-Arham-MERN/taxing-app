// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Fetching an attachment, handing it to the operating system, and saving a copy
//! of it elsewhere.
//!
//! The application ships no viewer of its own: it writes a temporary copy and
//! lets the practitioner's own applications display it (FR-066).

use crate::commands::error::{CommandError, ErrorKind};
use crate::state::AppState;
use crate::store::attachments;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// There is deliberately **no command that returns a file's contents**. Opening
// and saving both happen entirely inside Rust, so a file never crosses the IPC
// boundary on the way out either — which is also why `tauri::ipc::Response` is
// not needed here (FR-036, FR-037).

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Write the attachment out to this run's temporary folder and hand the path to
/// the operating system, so it opens in whichever application the practitioner
/// has set as their preference for that kind of file (FR-065–FR-069).
///
/// Every type is opened, with no exception and no warning added here — the
/// developer's decision of 2026-09-14, recorded in the spec's assumptions
/// (FR-071).
#[tauri::command]
pub async fn open_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    statement_id: String,
) -> Result<(), CommandError> {
    let data = state.with_connection(|conn| attachments::read(conn, &statement_id))?;

    let path = crate::temp::write_out(&state.run_folder, &data.file_name, &data.bytes)
        .map_err(|message| CommandError::new(ErrorKind::AttachmentWriteFailed, message))?;

    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| {
            // FR-075: told plainly, and the save action stays available.
            CommandError::new(
                ErrorKind::AttachmentOpenFailed,
                format!(
                    "Nothing on this machine would open that kind of file, so it could not be \
                     displayed ({error}). You can still save a copy of it."
                ),
            )
        })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Save a copy of an attachment wherever the practitioner chooses, through the
/// operating system's own save prompt with the original name offered (FR-072).
///
/// The stored attachment is not changed, moved or removed, and the copy is not
/// managed afterwards (FR-073).
#[tauri::command]
pub async fn save_attachment_copy(
    app: AppHandle,
    state: State<'_, AppState>,
    statement_id: String,
) -> Result<Option<String>, CommandError> {
    let data = state.with_connection(|conn| attachments::read(conn, &statement_id))?;

    let chosen = app
        .dialog()
        .file()
        .set_file_name(&data.file_name)
        .blocking_save_file();

    let Some(selected) = chosen else {
        // Cancelled: nothing is written anywhere.
        return Ok(None);
    };

    let destination = selected
        .into_path()
        .map_err(|error| CommandError::io(format!("That location cannot be used: {error}")))?;

    std::fs::write(&destination, &data.bytes).map_err(|error| {
        CommandError::new(
            ErrorKind::AttachmentWriteFailed,
            format!("The copy could not be written: {error}"),
        )
    })?;

    Ok(Some(destination.to_string_lossy().to_string()))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
