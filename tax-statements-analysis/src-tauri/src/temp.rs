// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The one place the application writes outside the store: temporary copies of
//! attachments, so another program can be handed a file to display (FR-067).
//!
//! Each run gets its own folder, and startup clears the folders of *other* runs.
//! That is what makes cleanup safe: this session's files are never candidates for
//! deletion, so a viewer still holding one open cannot block the new session
//! (research R10, FR-069, FR-070).

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Windows refuses to delete a file another process holds open, reporting one of
/// these. None of them is a failure worth surfacing — the file is simply cleared
/// on a later run.
const ERROR_ACCESS_DENIED: i32 = 5;
const ERROR_SHARING_VIOLATION: i32 = 32;
const ERROR_LOCK_VIOLATION: i32 = 33;

fn attachments_root(app: &AppHandle) -> Result<PathBuf, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("The application's temporary folder could not be located: {error}"))?;
    Ok(cache.join("attachments"))
}

/// A folder private to this run of the application.
pub fn start_run(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = attachments_root(app)?.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&folder)
        .map_err(|error| format!("The temporary folder could not be created: {error}"))?;
    Ok(folder)
}

/// Remove every run folder except this one, best effort. Anything still open in
/// a viewer is skipped and left for a later launch.
pub fn clear_other_runs(app: &AppHandle, current: &Path) {
    let Ok(root) = attachments_root(app) else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path == current || !path.is_dir() {
            continue;
        }
        remove_folder_tolerating_locks(&path);
    }
}

fn remove_folder_tolerating_locks(path: &Path) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let file = entry.path();
        if let Err(error) = std::fs::remove_file(&file) {
            if !is_lock_error(&error) {
                // Anything else (permissions, a read-only attribute) is also left
                // for a later run rather than reported: nothing the practitioner
                // can act on, and the store is untouched either way.
                continue;
            }
        }
    }
    let _ = std::fs::remove_dir(path);
}

fn is_lock_error(error: &std::io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(ERROR_ACCESS_DENIED) | Some(ERROR_SHARING_VIOLATION) | Some(ERROR_LOCK_VIOLATION)
    )
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Write a copy of an attachment into this run's folder, keeping the original
/// name and extension so the preferred application recognises the type and the
/// practitioner sees the name they know (FR-068).
pub fn write_out(folder: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let safe_name = sanitise(file_name);
    let target = folder.join(safe_name);
    std::fs::write(&target, bytes)
        .map_err(|error| format!("The file could not be written out to view it: {error}"))?;
    Ok(target)
}

/// Reduce a stored name to a bare file name: no directory separators, no
/// traversal, and never empty.
fn sanitise(file_name: &str) -> String {
    let cleaned: String = file_name
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect();

    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "attachment".to_string()
    } else {
        trimmed.to_string()
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
