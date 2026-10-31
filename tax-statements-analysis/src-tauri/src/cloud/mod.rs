// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The cloud module: everything network-facing lives here, mirroring how
//! `store/` is the only place the database is touched (plan §Project Structure).
//!
//! It opens the store as a **synced** local-first database when the secrets are
//! present, and exposes the `push()`/`pull()`/`checkpoint()`/`stats()` wrappers
//! the commands use (research R2). Nothing else in the application calls the
//! engine's sync surface directly.

pub mod config;
pub mod object_store;
pub mod outcome;
pub mod schedule;
pub mod secrets;
pub mod sync_state;
pub mod usage;

use crate::state::AppState;
use crate::store::{StoreError, StoreResult};
use std::path::Path;
use tauri::{AppHandle, Manager};

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Open the store as a **synced** database against the shared remote.
///
/// `bootstrap_if_empty(false)` is essential to FR-001: with the default the
/// local database would be bootstrapped from the cloud on first connect, which
/// needs the network on first launch and could fight an existing local store.
/// The first exchange is an explicit Push or Sync (research R2).
pub async fn open_synced(
    path: &Path,
    config: &config::Config,
) -> StoreResult<turso::sync::Database> {
    crate::log_info!(
        "cloud::open_synced: opening a synced database at {} against {}",
        path.display(),
        config.url()
    );
    let db = turso::sync::Builder::new_remote(&path.to_string_lossy())
        .with_remote_url(config.url())
        .with_auth_token(config.token())
        .bootstrap_if_empty(false)
        .build()
        .await?;
    crate::log_info!("cloud::open_synced: the synced database is open");
    Ok(db)
}

/// Publish this computer's changes to the central copy (FR-006–FR-012).
pub async fn push(db: &turso::sync::Database) -> Result<(), turso::Error> {
    crate::log_info!("cloud::push: publishing local changes");
    let result = db.push().await;
    match &result {
        Ok(()) => crate::log_info!("cloud::push: published"),
        Err(error) => crate::log_error!("cloud::push: failed: {error}"),
    }
    result
}

/// Bring the other computers' changes down; `true` when anything was applied
/// (FR-013–FR-020).
pub async fn pull(db: &turso::sync::Database) -> Result<bool, turso::Error> {
    crate::log_info!("cloud::pull: bringing down the other computers' changes");
    let result = db.pull().await;
    match &result {
        Ok(true) => crate::log_info!("cloud::pull: applied remote changes"),
        Ok(false) => crate::log_info!("cloud::pull: nothing new"),
        Err(error) => crate::log_error!("cloud::pull: failed: {error}"),
    }
    result
}

/// Fold the local WAL into the main database (research R2).
pub async fn checkpoint(db: &turso::sync::Database) -> Result<(), StoreError> {
    crate::log_debug!("cloud::checkpoint: folding the local WAL");
    Ok(db.checkpoint().await?)
}

/// Sync statistics, for diagnostics.
#[allow(dead_code)]
pub async fn stats(
    db: &turso::sync::Database,
) -> Result<turso::sync::DatabaseSyncStats, StoreError> {
    Ok(db.stats().await?)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// After a pull, fetch every referenced file this machine has not seen yet
/// ("Turso first, then the files"). Best-effort and idempotent: files already
/// cached are skipped, and a per-file failure only leaves that file for the
/// practitioner's manual open/download — exactly as before.
///
/// The store lock is held only long enough to read the references; the network
/// work happens with it released, so this never blocks a table read.
pub async fn download_all_files(app: &AppHandle) {
    let state = app.state::<AppState>();
    let config = state.object_storage();
    if config.is_none() {
        crate::log_debug!("cloud::download_all_files: Oracle is not configured — skipped");
        return;
    }

    let targets = state
        .with_connection(|session| async move {
            let mut targets = Vec::new();
            for reference in crate::store::attachments::all_refs(&session.conn).await? {
                targets.push((crate::store::object_cache::Scope::Statement, reference));
            }
            for reference in crate::store::client_records::all_file_refs(&session.conn).await? {
                targets.push((crate::store::object_cache::Scope::Record, reference));
            }
            Ok(targets)
        })
        .await
        .unwrap_or_default();

    if targets.is_empty() {
        crate::log_debug!("cloud::download_all_files: no files are referenced yet");
        return;
    }

    crate::files::fetch_missing(config.as_ref(), &state.cache, Some(app), &targets).await;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
