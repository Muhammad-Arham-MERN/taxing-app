// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The local un-pushed marker: `sync-state.json` beside `settings.json`
//! (research R8).
//!
//! It records whether local writes have happened since the last **successful**
//! push, and when that push was. Keeping it out of the store is deliberate: the
//! marker must not itself be synced to the cloud, and it must survive
//! independently of the store's open state at shutdown.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    /// There have been local writes since the last successful push (FR-025).
    pub dirty: bool,
    /// When the last push succeeded, as an ISO timestamp (R8).
    pub last_pushed_at: Option<String>,
}

fn state_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("sync-state.json"))
}

/// Read the marker. A missing or unreadable file means "nothing un-pushed",
/// which is the safe default: it never blocks a push, it only may let one be
/// skipped, and a manual Push still works (quickstart §5).
pub fn read(app: &AppHandle) -> SyncState {
    let state: SyncState = state_file(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    crate::log_debug!(
        "sync_state::read: dirty={} last_pushed_at={:?}",
        state.dirty,
        state.last_pushed_at
    );
    state
}

fn write(app: &AppHandle, state: &SyncState) {
    let Some(path) = state_file(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, raw);
    }
}

/// Record that local writes have happened since the last push.
pub fn mark_dirty(app: &AppHandle) {
    let mut state = read(app);
    if !state.dirty {
        crate::log_info!("sync_state::mark_dirty: there are now un-pushed changes");
        state.dirty = true;
        write(app, &state);
    }
}

/// Clear the marker and record the time of a successful push (R8).
pub fn clear_dirty(app: &AppHandle) {
    let state = SyncState {
        dirty: false,
        last_pushed_at: Some(crate::store::schema::now_iso()),
    };
    crate::log_info!(
        "sync_state::clear_dirty: the un-pushed marker is cleared (last pushed at {:?})",
        state.last_pushed_at
    );
    write(app, &state);
}
