// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Where the records live: asking the practitioner to choose, judging a location
//! before accepting it, and moving records between locations.

use crate::commands::error::CommandError;
use crate::platform::{self, LocationRisk};
use crate::settings::{self, LocationKind, StorageLocation, StorageState};
use crate::state::{AppState, StoreSession};
use crate::store::{self, carry, Verification};
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
pub fn get_storage_state(state: State<'_, AppState>) -> StorageState {
    let Ok(guard) = state.inner.lock() else {
        return StorageState::none();
    };

    StorageState {
        chosen: guard.session.is_some(),
        location: guard.location.clone(),
        problem: guard.problem,
    }
}

/// Open the operating system's folder picker. `null` means the practitioner
/// cancelled, and nothing must change (FR-014, FR-024).
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Result<Option<String>, CommandError> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(path_of(picked))
}

/// Open the operating system's file picker so the practitioner can point at a
/// store file they already hold — a backup, or one recovered after a machine was
/// rebuilt (FR-057).
#[tauri::command]
pub async fn pick_store_file(app: AppHandle) -> Result<Option<String>, CommandError> {
    let picked = app.dialog().file().blocking_pick_file();
    Ok(path_of(picked))
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
pub fn assess_location(kind: LocationKind, path: String) -> LocationAssessment {
    let target = PathBuf::from(&path);

    match kind {
        LocationKind::File => assess_file(&target),
        LocationKind::Directory => assess_directory(&target),
    }
}

fn assess_file(path: &Path) -> LocationAssessment {
    match store::verify_read_only(path) {
        Ok(Verification::Ours { empty }) => LocationAssessment::accepted(None, empty),
        Ok(Verification::NotOurs(problem)) => LocationAssessment::rejected(problem_message(problem)),
        Err(error) => LocationAssessment::rejected(error.to_string()),
    }
}

fn assess_directory(dir: &Path) -> LocationAssessment {
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
        return match store::verify_read_only(&store_path) {
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
    let location = StorageLocation { kind, path };
    let target = settings::store_file_path(&location);

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| CommandError::io("The store is busy. Try again."))?;

    let mut new_conn = open_destination(kind, &target, &location)?;

    let bringing = carry_across.as_deref() == Some(CARRY_BRING);
    let previous = guard
        .session
        .as_ref()
        .map(|session| settings::store_file_path(&session.location));

    if bringing {
        if let Some(previous_path) = previous {
            if previous_path != target && previous_path.exists() {
                if let Err(error) = carry::carry_from(&mut new_conn, &previous_path) {
                    // Report honestly how far it got, and say that running it
                    // again finishes the job — which is true because records
                    // already present are skipped (FR-021, FR-063).
                    let remaining = carry::remaining(&new_conn, &previous_path).unwrap_or(0);
                    let total = carry::statement_count(&previous_path).unwrap_or(remaining);
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

    settings::write_location(&app, &location).map_err(CommandError::io)?;

    guard.session = Some(StoreSession {
        conn: new_conn,
        location: location.clone(),
    });
    guard.location = Some(location.clone());
    guard.problem = None;

    Ok(StorageState {
        chosen: true,
        location: Some(location),
        problem: None,
    })
}

/// Open the destination store, creating it inside a chosen folder when it is not
/// there yet, or verifying an existing file before adopting it (FR-016, FR-062).
fn open_destination(
    kind: LocationKind,
    target: &Path,
    location: &StorageLocation,
) -> Result<rusqlite::Connection, CommandError> {
    match kind {
        LocationKind::Directory => {
            if !target.exists() {
                carry::create_store(target, env!("CARGO_PKG_VERSION")).map_err(|error| {
                    CommandError::from(store::StoreError::Unwritable(format!(
                        "A records file could not be created in {}: {error}",
                        location.path
                    )))
                })?;
            }
            store::open_existing(target).map_err(CommandError::from)
        }
        LocationKind::File => store::open_existing(target).map_err(CommandError::from),
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
