// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Application state: the open store, where it lives, and why it might not be
//! usable. Held behind a `tokio` mutex because the one instance owns the one
//! store (FR-054) and the lock is now held across `await` points, which a
//! `std::sync::Mutex` guard cannot be (research R3).

use crate::commands::error::CommandError;
use crate::settings::{self, StorageLocation, StorageProblem};
use crate::store::object_cache::ObjectCache;
use crate::store::{self, schema, StoreError, StoreResult, Verification};
use std::future::Future;
use std::path::PathBuf;
use tauri::AppHandle;
use tokio::sync::Mutex;
use turso::Connection;

/// The engine behind the open store. The store *is* the synced database when the
/// cloud secrets are present, and a plain local database when they are not
/// (research R2). `push()`/`pull()` are reachable only on the `Synced` arm.
pub enum StoreEngine {
    Synced(turso::sync::Database),
    Local(turso::Database),
}

impl StoreEngine {
    /// Open the one live connection to this engine.
    pub async fn connect(&self) -> StoreResult<Connection> {
        match self {
            StoreEngine::Synced(db) => {
                crate::log_debug!("opening a synced store connection");
                Ok(db.connect().await?)
            }
            StoreEngine::Local(db) => {
                crate::log_debug!("opening a local store connection");
                Ok(db.connect()?)
            }
        }
    }

    /// The synced handle, when there is one. Every cloud command checks this.
    pub fn synced(&self) -> Option<&turso::sync::Database> {
        match self {
            StoreEngine::Synced(db) => Some(db),
            StoreEngine::Local(_) => None,
        }
    }
}

pub struct StoreSession {
    pub engine: StoreEngine,
    pub conn: Connection,
    pub location: StorageLocation,
}

impl StoreSession {
    /// The file the store lives in.
    pub fn store_file(&self) -> PathBuf {
        settings::store_file_path(&self.location)
    }

    /// An owned clone of everything a store operation needs, so the operation's
    /// future borrows nothing from the locked guard.
    pub fn handle(&self) -> StoreHandle {
        StoreHandle {
            conn: self.conn.clone(),
            synced: self.engine.synced().cloned(),
        }
    }
}

/// An owned bundle handed to `AppState::with_connection`, so the closure is an
/// ordinary `FnOnce` rather than a higher-ranked one.
#[derive(Clone)]
pub struct StoreHandle {
    pub conn: Connection,
    /// The synced handle when the cloud secrets are present (research R2).
    pub synced: Option<turso::sync::Database>,
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
    pub run_folder: PathBuf,
    /// The local-only byte cache. Independent of the store (it is never synced),
    /// so it lives beside `AppState` rather than behind the store's mutex.
    pub cache: ObjectCache,
}

impl AppState {
    pub fn new(state: StoreState, run_folder: PathBuf, cache: ObjectCache) -> Self {
        AppState {
            inner: Mutex::new(state),
            run_folder,
            cache,
        }
    }

    /// The Oracle Object Storage settings, when the bucket values are present.
    /// Read from the credential store on demand, like every other cloud value.
    pub fn object_storage(&self) -> Option<crate::cloud::object_store::ObjectStoreConfig> {
        crate::cloud::config::load().and_then(|config| config.object_storage)
    }

    /// Run `f` against the open store, or explain why there is not one.
    ///
    /// Every data command goes through here, which is what implements the gate at
    /// the backend as well as the frontend: with no usable store, there is no
    /// path to a statement (FR-015). The lock is a `tokio` mutex held across the
    /// awaited store work, so store access stays serialised (research R3).
    pub async fn with_connection<T, F, Fut>(&self, f: F) -> Result<T, CommandError>
    where
        F: FnOnce(StoreHandle) -> Fut,
        Fut: Future<Output = StoreResult<T>>,
    {
        let guard = self.inner.lock().await;

        if guard.session.is_none() {
            crate::log_warn!(
                "with_connection: refused — no usable store is open (problem={:?})",
                guard.problem
            );
            return Err(match guard.problem {
                Some(problem) => CommandError::from_storage_problem(problem),
                None => CommandError::no_storage_location(),
            });
        }

        // The handle is an owned clone, so the closure's future does not borrow
        // the guard — while the guard still lives, keeping store access
        // serialised for the whole awaited operation.
        let handle = guard.session.as_ref().expect("checked above").handle();
        crate::log_debug!(
            "with_connection: running a store operation (synced={})",
            handle.synced.is_some()
        );
        let outcome = f(handle).await;
        match &outcome {
            Ok(_) => crate::log_debug!("with_connection: store operation finished"),
            Err(error) => crate::log_error!("with_connection: store operation failed: {error}"),
        }
        outcome.map_err(CommandError::from)
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Read the remembered location and try to open it.
///
/// A failure is recorded as a problem rather than raised, because the frontend
/// renders it as a state and offers a re-choice (FR-023, FR-025, FR-056). An
/// empty store is never substituted for one that cannot be reached.
pub async fn load(app: &AppHandle, cache: &ObjectCache) -> StoreState {
    let Some(location) = settings::read_location(app) else {
        crate::log_info!("load: no remembered location yet — the practitioner has not chosen one");
        return StoreState {
            session: None,
            location: None,
            problem: None,
        };
    };

    crate::log_info!(
        "load: remembered location = {} ({:?})",
        location.path,
        location.kind
    );
    let path = settings::store_file_path(&location);

    if !path.exists() {
        crate::log_warn!("load: the store file is missing: {}", path.display());
        return StoreState {
            session: None,
            location: Some(location),
            problem: Some(StorageProblem::Unreachable),
        };
    }

    match open_at(&path, &location, cache).await {
        Ok(session) => {
            crate::log_info!("load: the store is open and ready");
            StoreState {
                session: Some(session),
                location: Some(location),
                problem: None,
            }
        }
        Err(error) => {
            crate::log_error!("load: the store could not be opened: {error}");
            StoreState {
                session: None,
                location: Some(location),
                problem: Some(problem_of(error)),
            }
        }
    }
}

/// Verify, choose the engine (synced when the secrets exist, local otherwise),
/// connect, and bring the schema forward. Used both at startup and when the
/// practitioner commits a new storage location.
pub async fn open_at(
    path: &std::path::Path,
    location: &StorageLocation,
    cache: &ObjectCache,
) -> StoreResult<StoreSession> {
    crate::log_info!("open_at: opening {}", path.display());

    // A file that is not even a readable database is refused here, before any
    // write handle is opened on it (FR-060, SC-020). A file that *is* a database
    // is not judged from the read-only snapshot: a synced store keeps its
    // identity stamp in the WAL until it is folded into the main file, so only
    // the live engine — which replays the WAL — can say whether it is ours
    // (research R2).
    if let Verification::NotOurs(problem) = store::verify_read_only(path).await? {
        if !store::is_readable_database(path).await {
            crate::log_error!("open_at: the file is not a readable database: {problem:?}");
            return Err(problem.into());
        }
        crate::log_debug!("open_at: the read-only stamp was unavailable — judging through the engine");
    }

    let engine = engine_for(path).await?;

    let conn = engine.connect().await?;
    store::prepare_connection(&conn).await?;

    match store::verify_connection(&conn).await? {
        Verification::Ours { .. } => {
            crate::log_debug!("open_at: the file is verified as ours through the live engine");
        }
        Verification::NotOurs(problem) => {
            crate::log_error!("open_at: the file was rejected: {problem:?}");
            return Err(problem.into());
        }
    }

    schema::migrate(&conn, path, cache).await?;
    crate::log_info!("open_at: the store is ready (schema up to date)");

    Ok(StoreSession {
        engine,
        conn,
        location: location.clone(),
    })
}

/// Open the engine the store will actually run on: the **synced** one when the
/// cloud secrets are present, the plain **local** one otherwise (research R2).
/// Every path that opens or creates a store goes through here, so the schema is
/// always written to the store the practitioner will really use.
async fn engine_for(path: &std::path::Path) -> StoreResult<StoreEngine> {
    match crate::cloud::config::load() {
        Some(config) => {
            crate::log_info!("engine_for: cloud secrets present — opening the synced engine");
            Ok(StoreEngine::Synced(
                crate::cloud::open_synced(path, &config).await?,
            ))
        }
        None => {
            crate::log_info!("engine_for: no cloud secrets — opening the local engine");
            Ok(StoreEngine::Local(store::build_local(path).await?))
        }
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Create a fresh store at `path` **through the engine that will be used**, so
/// the schema and the identity stamp are the store's own local content.
///
/// Writing the schema with a plain local handle and only *then* opening the file
/// as a synced replica is what let the first exchange replace the whole store
/// with the remote's state: content written before the replica existed is not a
/// change it can push, so a pull from an empty cloud wiped it (research R2).
pub async fn create_at(
    path: &std::path::Path,
    location: &StorageLocation,
) -> StoreResult<StoreSession> {
    crate::log_info!("create_at: creating a new store at {}", path.display());
    let engine = engine_for(path).await?;
    let conn = engine.connect().await?;
    store::prepare_connection(&conn).await?;
    schema::apply(&conn, path, env!("CARGO_PKG_VERSION")).await?;
    crate::log_info!("create_at: the new store is ready");
    Ok(StoreSession {
        engine,
        conn,
        location: location.clone(),
    })
}

fn problem_of(error: StoreError) -> StorageProblem {
    match error {
        StoreError::Unreachable => StorageProblem::Unreachable,
        StoreError::NotAStore(_) => StorageProblem::NotAStore,
        StoreError::Unwritable(_) => StorageProblem::Unwritable,
        _ => StorageProblem::Damaged,
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Point the open session at the **synced** engine if it is not already there.
///
/// This never touches the network: `cloud::open_synced` uses
/// `bootstrap_if_empty(false)`, so it only connects the session to the cloud's
/// local replica — it does **not** pull or push anything. On any failure the
/// previous (local) engine is restored, so a failed switch leaves the
/// practitioner exactly where they were, still fully usable offline.
///
/// Returns `Ok(false)` when there is no storage location to open.
pub async fn ensure_synced_session(
    guard: &mut tokio::sync::MutexGuard<'_, StoreState>,
    config: &crate::cloud::config::Config,
    cache: &ObjectCache,
) -> StoreResult<bool> {
    let already_synced = guard
        .session
        .as_ref()
        .map(|session| session.engine.synced().is_some())
        .unwrap_or(false);
    if already_synced {
        return Ok(true);
    }

    let Some(location) = guard.location.clone() else {
        return Ok(false);
    };
    let path = settings::store_file_path(&location);

    // Two engines must never share one store file, so the local engine is closed
    // before the synced one is opened.
    crate::log_info!("ensure_synced_session: closing the local engine and opening the synced one");
    guard.session = None;

    let engine = match crate::cloud::open_synced(&path, config).await {
        Ok(db) => db,
        Err(error) => {
            restore_local(guard, &path, &location).await;
            return Err(error);
        }
    };

    let conn = match engine.connect().await {
        Ok(conn) => conn,
        Err(error) => {
            restore_local(guard, &path, &location).await;
            return Err(error.into());
        }
    };

    if let Err(error) = store::prepare_connection(&conn).await {
        restore_local(guard, &path, &location).await;
        return Err(error);
    }

    // Bring the schema forward before anything else sees the store (offline-safe:
    // file bytes land in the local cache and upload later).
    if let Err(error) = schema::migrate(&conn, &path, cache).await {
        restore_local(guard, &path, &location).await;
        return Err(error);
    }

    guard.session = Some(StoreSession {
        engine: StoreEngine::Synced(engine),
        conn,
        location,
    });
    guard.problem = None;
    crate::log_info!("ensure_synced_session: the store is now on the synced engine");
    Ok(true)
}

/// Re-open the store on the **local** engine, so a failed cloud connection leaves
/// the practitioner exactly where they were, still fully usable offline.
pub async fn restore_local(
    guard: &mut tokio::sync::MutexGuard<'_, StoreState>,
    path: &std::path::Path,
    location: &StorageLocation,
) {
    if let Ok(db) = store::build_local(path).await {
        if let Ok(conn) = db.connect() {
            let _ = store::prepare_connection(&conn).await;
            guard.session = Some(StoreSession {
                engine: StoreEngine::Local(db),
                conn,
                location: location.clone(),
            });
        }
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
