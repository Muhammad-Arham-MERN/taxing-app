// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Application state: the open store, where it lives, and why it might not be
//! usable. Held behind a mutex because the one instance owns the one store
//! (FR-054).

use crate::commands::error::CommandError;
use crate::settings::{self, StorageLocation, StorageProblem};
use crate::store::{self, StoreError};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::AppHandle;

pub struct StoreSession {
    pub conn: Connection,
    pub location: StorageLocation,
}

pub struct StoreState {
    pub session: Option<StoreSession>,
    pub location: Option<StorageLocation>,
    pub problem: Option<StorageProblem>,
}

pub struct AppState {
    pub inner: Mutex<StoreState>,
    /// This run's temporary folder, where attachments are written out so another
    /// program can display them (FR-067).
    pub run_folder: std::path::PathBuf,
}

impl AppState {
    pub fn new(state: StoreState, run_folder: std::path::PathBuf) -> Self {
        AppState {
            inner: Mutex::new(state),
            run_folder,
        }
    }

    /// Run `f` against the open store, or explain why there is not one.
    ///
    /// Every data command goes through here, which is what implements the gate at
    /// the backend as well as the frontend: with no usable store, there is no
    /// path to a statement (FR-015).
    pub fn with_connection<T>(
        &self,
        f: impl FnOnce(&mut Connection) -> store::StoreResult<T>,
    ) -> Result<T, CommandError> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| CommandError::io("The store is busy. Try again."))?;

        if guard.session.is_none() {
            return Err(match guard.problem {
                Some(problem) => CommandError::from_storage_problem(problem),
                None => CommandError::no_storage_location(),
            });
        }

        let session = guard.session.as_mut().expect("checked above");
        f(&mut session.conn).map_err(CommandError::from)
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Read the remembered location and try to open it.
///
/// A failure is recorded as a problem rather than raised, because the frontend
/// renders it as a state and offers a re-choice (FR-023, FR-025, FR-056). An
/// empty store is never substituted for one that cannot be reached.
pub fn load(app: &AppHandle) -> StoreState {
    let Some(location) = settings::read_location(app) else {
        return StoreState {
            session: None,
            location: None,
            problem: None,
        };
    };

    let path = settings::store_file_path(&location);

    if !path.exists() {
        return StoreState {
            session: None,
            location: Some(location),
            problem: Some(StorageProblem::Unreachable),
        };
    }

    match store::open_existing(&path) {
        Ok(conn) => StoreState {
            session: Some(StoreSession {
                conn,
                location: location.clone(),
            }),
            location: Some(location),
            problem: None,
        },
        Err(error) => StoreState {
            session: None,
            location: Some(location),
            problem: Some(match error {
                StoreError::Unreachable => StorageProblem::Unreachable,
                StoreError::NotAStore(_) => StorageProblem::NotAStore,
                _ => StorageProblem::Damaged,
            }),
        },
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
