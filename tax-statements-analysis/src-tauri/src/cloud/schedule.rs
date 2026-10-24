// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Automatic sync: one pull shortly after startup, then about every 60 minutes
//! (research R9, FR-021–FR-024).
//!
//! Runs in a Rust background task, so it keeps working regardless of which tab is
//! open and does not depend on the webview. Each pull runs only when the secrets
//! are present; when it brought something, it emits `cloud://pulled` and the
//! frontend refreshes its lists — exactly the mechanism `App.tsx` already uses
//! after a create or edit. An in-progress form is never disturbed (FR-023).

use super::config;
use crate::state::AppState;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Emitted after an **automatic** pull that changed something.
pub const PULLED_EVENT: &str = "cloud://pulled";

/// About an hour between automatic pulls (FR-022).
const INTERVAL: Duration = Duration::from_secs(60 * 60);

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Spawn the background sync task. Called from Tauri's `setup` after the store
/// is opened (R9).
pub fn spawn(app: AppHandle) {
    crate::log_info!(
        "schedule::spawn: automatic sync every {} minute(s)",
        INTERVAL.as_secs() / 60
    );
    tauri::async_runtime::spawn(async move {
        // Startup pull.
        crate::log_debug!("schedule: running the startup pull");
        pull_once(&app).await;

        loop {
            tokio::time::sleep(INTERVAL).await;
            crate::log_debug!("schedule: running the timed pull");
            pull_once(&app).await;
        }
    });
}

/// Best-effort: send any file bytes that are still only on this machine to
/// Oracle. Needs only the object-storage values, so it runs whether or not Turso
/// is configured, and never propagates a failure (an offline moment leaves the
/// next attempt to try again).
async fn drain_pending_quietly(app: &AppHandle) {
    let state = app.state::<AppState>();
    let config = state.object_storage();
    if config.is_none() {
        return;
    }
    let report = crate::files::drain_pending(config.as_ref(), &state.cache).await;
    if report.uploaded > 0 || report.failed > 0 {
        crate::log_info!(
            "schedule::drain_pending_quietly: uploaded={} failed={} remaining={}",
            report.uploaded,
            report.failed,
            report.remaining
        );
    }
}

/// One quiet pull, if the secrets are present. Never propagates an error: an
/// unreachable cloud simply leaves the next attempt to try again (FR-024).
async fn pull_once(app: &AppHandle) {
    // Files first: a reference must never be published before its bytes are in
    // Oracle. This also catches files saved while the machine was offline.
    drain_pending_quietly(app).await;

    if !config::is_configured() {
        crate::log_debug!("schedule::pull_once: skipped — the cloud is not set up");
        return;
    }

    // The first exchange is explicit (research R2). A store's own content is not in
    // the cloud's history until it has been pushed once, so an automatic pull
    // before then would reconcile the store *down* to the cloud's state and lose
    // the local schema. Pulls begin once the store has been published once.
    if crate::cloud::sync_state::read(app).last_pushed_at.is_none() {
        crate::log_debug!(
            "schedule::pull_once: skipped — this store has never been pushed, and the first \
             exchange is an explicit Push or Sync"
        );
        return;
    }

    crate::log_debug!("schedule::pull_once: pulling");

    let state = app.state::<AppState>();
    let changed = state
        .with_connection(|session| async move {
            match session.synced.as_ref() {
                Some(db) => Ok(crate::cloud::pull(db).await.unwrap_or(false)),
                None => Ok(false),
            }
        })
        .await
        .unwrap_or(false);

    if changed {
        crate::log_info!("schedule::pull_once: changes arrived — telling the frontend to refresh");
        let _ = app.emit(PULLED_EVENT, ());
    } else {
        crate::log_debug!("schedule::pull_once: nothing changed");
    }
}
