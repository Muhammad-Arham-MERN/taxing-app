// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Where the records live: asking the practitioner to choose, judging a location
//! before accepting it, and moving records between locations.
//!
//! Module 4 makes these commands `async` and runs everything through the Turso
//! engine (research R3); the carry-across now also moves the local
//! `attachments/` folder beside the store (data-model §5).

use crate::commands::error::CommandError;
use crate::platform::{self, LocationRisk};
use crate::settings::{self, LocationKind, StorageLocation, StorageState};
use crate::state::{self, AppState};
use crate::store::{self, carry, StoreError, Verification};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// The value the frontend sends when the practitioner chooses to bring their
/// existing records into a new location (FR-019).
const CARRY_BRING: &str = "bring";

/// Everything that must be known about a candidate location **before** it is
/// accepted, in one round trip (`contracts/tauri-commands.md`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationAssessment {
    pub acceptable: bool,
    /// Set when the folder is cloud-synced, on a network share or removable
    /// media, so the warning can be shown first (FR-055).
    pub warning: Option<LocationRisk>,
    /// Set when the file is not one of our stores, with the reason (FR-060).
    pub rejection: Option<String>,
    /// A valid store file that simply holds nothing yet (FR-064).
    pub is_empty_store: bool,
}

impl LocationAssessment {
    fn accepted(warning: Option<LocationRisk>, is_empty_store: bool) -> Self {
        LocationAssessment {
            acceptable: true,
            warning,
            rejection: None,
            is_empty_store,
        }
    }

    fn rejected(reason: impl Into<String>) -> Self {
        LocationAssessment {
            acceptable: false,
            warning: None,
            rejection: Some(reason.into()),
            is_empty_store: false,
        }
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The state the frontend's gate renders from. Never fails: an unusable location
/// is a *state* the practitioner is told about and can act on, not an error
/// (FR-015, FR-023, FR-025, FR-056).
#[tauri::command]
pub async fn get_storage_state(state: State<'_, AppState>) -> Result<StorageState, CommandError> {
    crate::log_info!("-> get_storage_state");
    let guard = state.inner.lock().await;
    let result: Result<StorageState, CommandError> = Ok(StorageState {
        chosen: guard.session.is_some(),
        location: guard.location.clone(),
        problem: guard.problem,
    });
    if let Ok(ref view) = result {
        crate::log_debug!(
            "get_storage_state: chosen={} location={:?} problem={:?}",
            view.chosen,
            view.location.as_ref().map(|location| location.path.as_str()),
            view.problem
        );
    }
    crate::commands::log_outcome("get_storage_state", &result);
    result
}

/// Open the operating system's folder picker. `null` means the practitioner
/// cancelled, and nothing must change (FR-014, FR-024).
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Result<Option<String>, CommandError> {
    crate::log_info!("-> pick_directory (opening the folder picker)");
    let picked = app.dialog().file().blocking_pick_folder();
    let result = Ok(path_of(picked));
    if let Ok(Some(ref path)) = result {
        crate::log_info!("pick_directory: chose {path}");
    } else {
        crate::log_info!("pick_directory: cancelled");
    }
    crate::commands::log_outcome("pick_directory", &result);
    result
}

/// Open the operating system's file picker so the practitioner can point at a
/// store file they already hold — a backup, or one recovered after a machine was
/// rebuilt (FR-057).
#[tauri::command]
pub async fn pick_store_file(app: AppHandle) -> Result<Option<String>, CommandError> {
    crate::log_info!("-> pick_store_file (opening the file picker)");
    let picked = app.dialog().file().blocking_pick_file();
    let result = Ok(path_of(picked));
    if let Ok(Some(ref path)) = result {
        crate::log_info!("pick_store_file: chose {path}");
    } else {
        crate::log_info!("pick_store_file: cancelled");
    }
    crate::commands::log_outcome("pick_store_file", &result);
    result
}

fn path_of(picked: Option<tauri_plugin_dialog::FilePath>) -> Option<String> {
    picked
        .and_then(|file| file.into_path().ok())
        .map(|path| path.to_string_lossy().to_string())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Judge a candidate location. **Read-only**: nothing here opens a write handle,
/// which is what guarantees a rejected file is left byte-for-byte unchanged
/// (FR-060, SC-020).
#[tauri::command]
pub async fn assess_location(kind: LocationKind, path: String) -> LocationAssessment {
    crate::log_info!("-> assess_location kind={kind:?} path={path}");
    let target = PathBuf::from(&path);

    let assessment = match kind {
        LocationKind::File => assess_file(&target).await,
        LocationKind::Directory => assess_directory(&target).await,
    };
    crate::log_info!(
        "assess_location: acceptable={} warning={:?} empty={} rejection={:?}",
        assessment.acceptable,
        assessment.warning,
        assessment.is_empty_store,
        assessment.rejection
    );
    assessment
}

async fn assess_file(path: &Path) -> LocationAssessment {
    match store::verify_read_only(path).await {
        Ok(Verification::Ours { empty }) => LocationAssessment::accepted(None, empty),
        Ok(Verification::NotOurs(problem)) => LocationAssessment::rejected(problem_message(problem)),
        Err(error) => LocationAssessment::rejected(error.to_string()),
    }
}

async fn assess_directory(dir: &Path) -> LocationAssessment {
    if !dir.is_dir() {
        return LocationAssessment::rejected("That is not a folder.");
    }
    if let Err(reason) = writable_probe(dir) {
        return LocationAssessment::rejected(reason);
    }

    let warning = platform::classify(dir);
    let store_path = dir.join(settings::STORE_FILE_NAME);

    // A folder that already holds a store is ADOPTED, never overwritten (FR-026).
    if store_path.exists() {
        return match store::verify_read_only(&store_path).await {
            Ok(Verification::Ours { empty }) => LocationAssessment::accepted(warning, empty),
            Ok(Verification::NotOurs(problem)) => LocationAssessment {
                warning,
                ..LocationAssessment::rejected(problem_message(problem))
            },
            Err(error) => LocationAssessment {
                warning,
                ..LocationAssessment::rejected(error.to_string())
            },
        };
    }

    LocationAssessment::accepted(warning, true)
}

/// Can we actually write here? Asked by creating and removing a file, because
/// permissions and read-only media are not visible from metadata alone.
fn writable_probe(dir: &Path) -> Result<(), String> {
    let probe = dir.join(".tax-statements-write-test");
    match std::fs::File::create(&probe) {
        Ok(file) => {
            drop(file);
            let _ = std::fs::remove_file(&probe);
            Ok(())
        }
        Err(error) => Err(format!("That folder cannot be written to: {error}")),
    }
}

fn problem_message(problem: store::StoreProblem) -> String {
    match problem {
        store::StoreProblem::Unreachable => "That file could not be reached.".to_string(),
        store::StoreProblem::NotAStore(reason) => reason,
        store::StoreProblem::Damaged => "That file is one of this application's records files, \
             but it cannot be read because it is damaged. It has been left untouched."
            .to_string(),
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Commit a location: create a store in a chosen folder, or adopt one the
/// practitioner already holds, optionally bringing their current records with
/// them.
///
/// Ordering matters and is deliberate: the new location is opened and verified
/// **first**, and nothing about the current session is changed until that has
/// succeeded. So a failure leaves the practitioner exactly where they were with
/// their existing store still usable (FR-023, FR-061).
#[tauri::command]
pub async fn set_storage_location(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: LocationKind,
    path: String,
    carry_across: Option<String>,
) -> Result<StorageState, CommandError> {
    crate::log_info!(
        "-> set_storage_location kind={kind:?} path={path} carry_across={carry_across:?}"
    );
    let result = apply_storage_location(app, state, kind, path, carry_across).await;
    crate::commands::log_outcome("set_storage_location", &result);
    result
}

async fn apply_storage_location(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: LocationKind,
    path: String,
    carry_across: Option<String>,
) -> Result<StorageState, CommandError> {
    let location = StorageLocation { kind, path };
    let target = settings::store_file_path(&location);
    crate::log_debug!("set_storage_location: the store file is {}", target.display());

    let creating = kind == LocationKind::Directory && !target.exists();

    let mut guard = state.inner.lock().await;

    // Create the store **through the engine that will be used** when the chosen
    // folder holds none yet; otherwise open and verify what is already there. The
    // schema must become the store's own content, or the first sync replaces it
    // (state::create_at).
    let session = if creating {
        crate::log_info!("set_storage_location: creating a new store file");
        state::create_at(&target, &location)
            .await
            .map_err(|error| {
                CommandError::from(StoreError::Unwritable(format!(
                    "A records file could not be created in {}: {error}",
                    location.path
                )))
            })?
    } else {
        state::open_at(&target, &location, &state.cache)
            .await
            .map_err(CommandError::from)?
    };

    let bringing = carry_across.as_deref() == Some(CARRY_BRING);
    crate::log_info!("set_storage_location: bring existing records = {bringing}");
    let previous_store_file = guard.session.as_ref().map(|session| session.store_file());

    if bringing {
        if let Some(previous_path) = previous_store_file {
            if previous_path != target && previous_path.exists() {
                if let Err(error) = carry::carry_from(&session.conn, &target, &previous_path).await {
                    // Report honestly how far it got, and say that running it
                    // again finishes the job — which is true because records
                    // already present are skipped (FR-021, FR-063).
                    let remaining = carry::remaining(&session.conn, &previous_path)
                        .await
                        .unwrap_or(0);
                    let total = carry::statement_count(&previous_path)
                        .await
                        .unwrap_or(remaining);
                    return Err(CommandError::carry_interrupted(
                        total.saturating_sub(remaining),
                        remaining,
                        format!(
                            "{error} Nothing has been lost: the records still in the previous \
                             location are untouched, and choosing this location again will \
                             finish the move."
                        ),
                    ));
                }
            }
        }
    }

    // A brand-new store's schema and identity stamp are **local content**, and the
    // sync engine treats the cloud as the source of truth for the database. Until
    // this store has been pushed once, its content is not in the cloud's history,
    // and the first pull would reconcile the store *down* to the cloud's (empty)
    // state — losing the schema and the stamp. Publish it now, before any pull can
    // run (research R2; the outcome of the push is still reported on the next
    // explicit Push).
    if creating {
        if let Some(db) = session.engine.synced() {
            match crate::cloud::push(db).await {
                Ok(()) => {
                    crate::cloud::sync_state::clear_dirty(&app);
                    crate::log_info!("set_storage_location: the new store is published to the cloud");
                }
                Err(error) => crate::log_warn!(
                    "set_storage_location: the new store could not be published yet — it stays \
                     local and Pulls stay paused until it is: {error}"
                ),
            }
        }
    }

    settings::write_location(&app, &location).map_err(CommandError::io)?;

    crate::log_info!("set_storage_location: the new location is committed");
    guard.session = Some(session);
    guard.location = Some(location.clone());
    guard.problem = None;

    Ok(StorageState {
        chosen: true,
        location: Some(location),
        problem: None,
    })
}
