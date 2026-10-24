// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The store: the one self-contained database file that holds everything the
//! practitioner owns. **This module is the only place the store engine appears.**
//!
//! Module 4 swaps the engine from `rusqlite` to the async `turso` crate
//! (research R2, R3), so every routine here is `async`. The whole store is now a
//! local-first Turso database: reads and writes stay local and work offline, and
//! `cloud/` adds the `push()`/`pull()` that moves changes through the one central
//! copy. The engine-parity spike (research R1) proved the features this schema
//! depends on — `STRICT`, `PRAGMA application_id`/`user_version`, `CHECK`,
//! `COLLATE NOCASE`, foreign-key cascade, `GROUP_CONCAT`/`SUM` — so the shape is
//! unchanged.
//!
//! Shape and rationale: `specs/002-statements-persistence/research.md` (R2, the
//! identity stamp; R3, attachments in their own table) and
//! `specs/004-cloud-sync/data-model.md` §1 (the v5 move of attachment bytes out).

pub mod attachments;
pub mod bills;
pub mod carry;
pub mod categories;
pub mod client_records;
pub mod clients;
pub mod customers;
pub mod object_cache;
pub mod schema;
pub mod statements;

use std::path::Path;
use turso::{Builder, Connection, Value};

/// Header marker written when a store is created and checked whenever one is
/// opened (FR-059). SQLite reserves this field for exactly this purpose.
pub const APPLICATION_ID: i64 = 0x4D4D_5453; // "MMTS"

/// Schema version stamped into `user_version`. Version 2 adds the Module 3
/// tables (customers, bills, bill_items); version 3 adds the customer's
/// password; version 4 adds the bill's wallet numbers; version 5 moved attachment
/// bytes out of the store; version 6 brings them back in (a `data` BLOB) and
/// adds the client tables; version 7 adds categories (shared by clients and
/// their records), the per-client records and their files, and the client's own
/// password and category; **version 8 replaces every file's bytes with an object
/// reference — the bytes now live in Oracle Object Storage (`cloud::object_store`)
/// and, offline, in the local-only cache (`store::object_cache`)**. An older
/// store is migrated additively the first time it is opened (`schema::migrate`).
pub const SCHEMA_VERSION: i64 = 8;

/// The tables a version-1 store must have.
const REQUIRED_TABLES_V1: [&str; 3] = ["app_meta", "statements", "attachments"];

/// The tables a version-2 store must also have.
const REQUIRED_TABLES_V2: [&str; 6] = [
    "app_meta",
    "statements",
    "attachments",
    "customers",
    "bills",
    "bill_items",
];

/// The tables a version-4 store must also have.
const REQUIRED_TABLES_V4: [&str; 7] = [
    "app_meta",
    "statements",
    "attachments",
    "customers",
    "bills",
    "bill_items",
    "bill_wallets",
];

/// The tables a version-5 store must have — the same seven as v4 (only the shape
/// of `attachments` differed).
const REQUIRED_TABLES_V5: [&str; 7] = REQUIRED_TABLES_V4;

/// The tables a version-6 store must also have: the seven above plus the client
/// book.
const REQUIRED_TABLES_V6: [&str; 9] = [
    "app_meta",
    "statements",
    "attachments",
    "customers",
    "bills",
    "bill_items",
    "bill_wallets",
    "clients",
    "client_contacts",
];

/// The tables a version-7 store must also have: the client book plus the shared
/// categories and the per-client records (with their files).
const REQUIRED_TABLES_V7: [&str; 12] = [
    "app_meta",
    "statements",
    "attachments",
    "customers",
    "bills",
    "bill_items",
    "bill_wallets",
    "clients",
    "client_contacts",
    "categories",
    "client_records",
    "client_record_files",
];

/// The tables a version-8 store must have: the same twelve as v7 — only the
/// shape of `attachments` and `client_record_files` differs (an object reference
/// replaces the `data` BLOB).
const REQUIRED_TABLES_V8: [&str; 12] = REQUIRED_TABLES_V7;

/// Everything that can go wrong below the command layer. Mapped to the IPC error
/// enum in `commands::error` so the frontend never parses a string.
#[derive(Debug)]
pub enum StoreError {
    /// The engine itself failed (a bad statement, a constraint, a busy lock).
    Engine(turso::Error),
    Io(std::io::Error),
    /// The remembered location cannot be reached (FR-025).
    Unreachable,
    /// The file is not one of our stores (FR-060).
    NotAStore(String),
    /// The file is ours but cannot be read (FR-056).
    Damaged,
    /// The chosen location cannot be written to (FR-023).
    Unwritable(String),
    /// The From date is later than the To date (FR-034).
    InvalidRange,
    /// No statement with that id exists.
    UnknownStatement,
    /// No bill with that id exists.
    UnknownBill,
    /// No client with that CNIC exists.
    UnknownClient,
    /// No category with that id exists.
    UnknownCategory,
    /// No client record with that id exists.
    UnknownRecord,
    /// The statement exists but carries no attachment.
    NoAttachment,
    /// A file-carrying write reached the store without its reference, meaning the
    /// command's upload step did not run. Should never happen; reported rather
    /// than panicking.
    FileMissing,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Engine(error) => write!(f, "The store could not be read: {error}"),
            StoreError::Io(error) => write!(f, "The store could not be reached: {error}"),
            StoreError::Unreachable => write!(
                f,
                "The folder holding your records cannot be reached. It may have been moved, \
                 renamed, or be on a drive that is not connected."
            ),
            StoreError::NotAStore(reason) => write!(f, "{reason}"),
            StoreError::Damaged => write!(
                f,
                "Your records file cannot be opened because it is damaged. It has been left \
                 exactly as it is, untouched."
            ),
            StoreError::Unwritable(reason) => write!(f, "{reason}"),
            StoreError::InvalidRange => {
                write!(f, "The From date must be on or before the To date.")
            }
            StoreError::UnknownStatement => write!(f, "That statement no longer exists."),
            StoreError::UnknownBill => write!(f, "That bill no longer exists."),
            StoreError::UnknownClient => write!(f, "That client no longer exists."),
            StoreError::UnknownCategory => write!(f, "That category no longer exists."),
            StoreError::UnknownRecord => write!(f, "That record no longer exists."),
            StoreError::NoAttachment => write!(f, "That statement has no attached file."),
            StoreError::FileMissing => {
                write!(f, "The file's contents did not reach the store, so nothing was saved.")
            }
        }
    }
}

impl From<turso::Error> for StoreError {
    fn from(error: turso::Error) -> Self {
        StoreError::Engine(error)
    }
}

impl From<std::io::Error> for StoreError {
    fn from(error: std::io::Error) -> Self {
        StoreError::Io(error)
    }
}

pub type StoreResult<T> = Result<T, StoreError>;

/// What inspecting a file told us. Never performs a write, so a rejected file is
/// left byte-for-byte unchanged (FR-060, SC-020).
#[derive(Debug)]
pub enum Verification {
    /// Ours. `empty` is true when it holds no statements **and** no bills (FR-064).
    Ours { empty: bool },
    /// Not usable as a store, with the reason to show the practitioner.
    NotOurs(StoreProblem),
}

#[derive(Debug)]
pub enum StoreProblem {
    Unreachable,
    NotAStore(String),
    Damaged,
}

impl From<StoreProblem> for StoreError {
    fn from(problem: StoreProblem) -> Self {
        match problem {
            StoreProblem::Unreachable => StoreError::Unreachable,
            StoreProblem::NotAStore(reason) => StoreError::NotAStore(reason),
            StoreProblem::Damaged => StoreError::Damaged,
        }
    }
}

/// Turn an engine failure into a store *state* when it is really "this is not
/// our file" or "this file is unreadable", so opening reports a state rather
/// than an error (FR-056, FR-060).
fn classify_open_error(error: &turso::Error) -> StoreProblem {
    match error {
        turso::Error::NotAdb(_) => StoreProblem::NotAStore(
            "That file is not a database, so it is not one of this application's records files."
                .to_string(),
        ),
        turso::Error::Corrupt(_) => StoreProblem::Damaged,
        turso::Error::IoError(..) => StoreProblem::Unreachable,
        turso::Error::Error(message) if message.contains("not a database") => {
            StoreProblem::NotAStore(
                "That file is not a database, so it is not one of this application's records \
                 files."
                    .to_string(),
            )
        }
        _ => StoreProblem::Damaged,
    }
}

/// Build a **local** (un-synced) Turso database handle for `path`. Used on a
/// machine that has not been set up yet and by the read-only verification path
/// (research R2).
pub async fn build_local(path: &Path) -> StoreResult<turso::Database> {
    crate::log_debug!("build_local: opening a local database handle for {}", path.display());
    let db = Builder::new_local(&path.to_string_lossy()).build().await?;
    Ok(db)
}

/// Apply the connection-level pragmas the store relies on. `foreign_keys` is
/// what makes `ON DELETE CASCADE` and the bill's customer foreign key fire.
pub async fn prepare_connection(conn: &Connection) -> StoreResult<()> {
    crate::log_debug!("prepare_connection: enabling foreign keys and setting a 5s busy timeout");
    conn.execute("PRAGMA foreign_keys = ON", ()).await?;
    let _ = conn.busy_timeout(std::time::Duration::from_secs(5));
    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Decide whether a file is one of our stores, **without writing to it**.
///
/// The order is cheapest-first (research R6): a read that forces the engine to
/// validate the file header, then the application marker, then the schema
/// version, then the tables themselves. The database is opened read-only, so a
/// rejected file is left byte-for-byte unchanged (FR-060, SC-020).
///
/// A read-only open cannot replay a WAL, so a store whose stamp has not been
/// folded into the main file yet is not recognised here. The store the
/// practitioner actually uses is verified through `verify_connection` on the
/// live engine instead, which does replay the WAL (research R2).
pub async fn verify_read_only(path: &Path) -> StoreResult<Verification> {
    crate::log_debug!("verify_read_only: inspecting {}", path.display());

    if !path.exists() {
        crate::log_debug!("verify_read_only: file does not exist");
        return Ok(Verification::NotOurs(StoreProblem::Unreachable));
    }

    let db = match Builder::new_local(&path.to_string_lossy())
        .read_only(true)
        .build()
        .await
    {
        Ok(db) => db,
        Err(error) => {
            crate::log_warn!("verify_read_only: could not open read-only: {error}");
            return Ok(Verification::NotOurs(classify_open_error(&error)));
        }
    };
    let conn = db.connect()?;
    verify_connection(&conn).await
}

/// Whether the file opens read-only and reads as a database at all — the cheap
/// first step of verification, exposed so `open_at` can tell a file that is
/// plainly not a database (which must be rejected untouched) from a readable one
/// whose stamp simply was not visible in the read-only snapshot (FR-060, SC-020).
pub async fn is_readable_database(path: &Path) -> bool {
    let Ok(db) = Builder::new_local(&path.to_string_lossy())
        .read_only(true)
        .build()
        .await
    else {
        return false;
    };
    let Ok(conn) = db.connect() else {
        return false;
    };
    match conn.query("SELECT count(*) FROM sqlite_master", ()).await {
        Ok(mut rows) => rows.next().await.is_ok(),
        Err(_) => false,
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The identity and shape checks, run against a **live connection** so the WAL is
/// honoured. Shared by `verify_read_only` (a read-only snapshot, for judging a
/// file before it is adopted) and `open_at` (the engine the practitioner will
/// actually use).
pub async fn verify_connection(conn: &Connection) -> StoreResult<Verification> {
    // The engine validates the file header on the first read, not necessarily at
    // open.
    if let Err(error) = conn.query("SELECT count(*) FROM sqlite_master", ()).await {
        crate::log_warn!("verify_connection: the file header is not readable: {error}");
        return Ok(Verification::NotOurs(classify_open_error(&error)));
    }

    // Identity. The sync engine owns a synced store's file header — it reads
    // `application_id = 0` there — so ownership is proved either by the header
    // (a local-only store) **or** by the content marker that travels with the
    // database (research R2).
    let header_id = pragma_i64(conn, "application_id").await?;
    let marker = app_meta_value(conn, schema::OWNERSHIP_KEY).await?;
    let ours = header_id == APPLICATION_ID || marker.as_deref() == Some(schema::OWNERSHIP_VALUE);
    if !ours {
        crate::log_warn!(
            "verify_connection: application_id {header_id:#x} and no ownership marker — not ours"
        );
        return Ok(Verification::NotOurs(StoreProblem::NotAStore(
            "That file belongs to a different application, so it is not one of this \
             application's records files."
                .to_string(),
        )));
    }

    // Version: the file header where it is usable, the content marker otherwise
    // (the synced header can read 0 even for a fully-shaped store).
    let header_version = pragma_i64(conn, "user_version").await?;
    let marker_version = app_meta_value(conn, schema::VERSION_KEY)
        .await?
        .and_then(|value| value.trim().parse::<i64>().ok());
    let version = if (1..=SCHEMA_VERSION).contains(&header_version) {
        header_version
    } else {
        marker_version.unwrap_or(header_version)
    };
    crate::log_debug!("verify_connection: schema version {version}");
    if version < 1 || version > SCHEMA_VERSION {
        crate::log_warn!("verify_connection: schema version {version} is not understood");
        return Ok(Verification::NotOurs(StoreProblem::NotAStore(format!(
            "That file was written in a shape this version of the application does not \
             understand (version {version})."
        ))));
    }

    // A version-1 store legitimately lacks the Module 3 tables; only a version-2
    // store must have them. The version is checked above, so this stays cheap.
    let required: &[&str] = if version >= 8 {
        &REQUIRED_TABLES_V8
    } else if version >= 7 {
        &REQUIRED_TABLES_V7
    } else if version >= 6 {
        &REQUIRED_TABLES_V6
    } else if version >= 4 {
        &REQUIRED_TABLES_V4
    } else if version >= 2 {
        &REQUIRED_TABLES_V2
    } else {
        &REQUIRED_TABLES_V1
    };
    for table in required {
        if !table_exists(conn, table).await? {
            crate::log_warn!("verify_connection: required table '{table}' is missing");
            return Ok(Verification::NotOurs(StoreProblem::NotAStore(
                "That file is a database but does not hold this application's records.".to_string(),
            )));
        }
    }
    let _ = &REQUIRED_TABLES_V5; // reserved for the v5 shape check above v4.

    // "Empty" means nothing to lose: no statements and, where the tables exist,
    // no bills either (FR-064, Module 3).
    let statements = count(conn, "statements").await?;
    let bills = if version >= 2 { count(conn, "bills").await? } else { 0 };
    crate::log_debug!(
        "verify_connection: ours — {statements} statement(s), {bills} bill(s), empty={}",
        statements == 0 && bills == 0
    );
    Ok(Verification::Ours {
        empty: statements == 0 && bills == 0,
    })
}

/// Read one integer pragma (e.g. `application_id`, `user_version`).
pub async fn pragma_i64(conn: &Connection, name: &str) -> StoreResult<i64> {
    let mut rows = conn.query(&format!("PRAGMA {name}"), ()).await?;
    let value = match rows.next().await? {
        Some(row) => as_integer(&row.get_value(0)?).unwrap_or(0),
        None => 0,
    };
    crate::log_debug!("pragma {name} = {value}");
    Ok(value)
}

/// Whether a table exists (used by verification and the migration guard).
pub async fn table_exists(conn: &Connection, name: &str) -> StoreResult<bool> {
    let mut rows = conn
        .query(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [name],
        )
        .await?;
    let present = rows.next().await?.is_some();
    crate::log_debug!("table_exists: {name} = {present}");
    Ok(present)
}

/// One `app_meta` value, or `None` when the table or the key is absent. This is
/// how the store's **content identity** is read, which survives on a synced store
/// where the file header is owned by the sync engine (research R2).
pub async fn app_meta_value(conn: &Connection, key: &str) -> StoreResult<Option<String>> {
    if !table_exists(conn, "app_meta").await? {
        return Ok(None);
    }
    let mut rows = conn
        .query("SELECT value FROM app_meta WHERE key = ?1", [key])
        .await?;
    Ok(match rows.next().await? {
        Some(row) => match row.get_value(0)? {
            Value::Text(text) => Some(text),
            _ => None,
        },
        None => None,
    })
}

/// How many rows a table holds.
pub async fn count(conn: &Connection, table: &str) -> StoreResult<i64> {
    let mut rows = conn
        .query(&format!("SELECT count(*) FROM {table}"), ())
        .await?;
    let value = match rows.next().await? {
        Some(row) => as_integer(&row.get_value(0)?).unwrap_or(0),
        None => 0,
    };
    crate::log_debug!("count: {table} holds {value} row(s)");
    Ok(value)
}

pub fn as_integer(value: &Value) -> Option<i64> {
    match value {
        Value::Integer(number) => Some(*number),
        _ => None,
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
