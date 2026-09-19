// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The store: the one self-contained SQLite file that holds everything the
//! practitioner owns. This module is the only place `rusqlite` appears.
//!
//! Design decisions live in `specs/002-statements-persistence/research.md`:
//! R2 (rollback journal, so the `.db` alone is the whole store), R3 (attachments
//! in their own table with the blob last), R6 (how a file is recognised as ours).

pub mod attachments;
pub mod bills;
pub mod carry;
pub mod customers;
pub mod schema;
pub mod statements;

use rusqlite::{Connection, ErrorCode, OpenFlags};
use std::path::Path;

/// Header marker written when a store is created and checked whenever one is
/// opened (FR-059). SQLite reserves this field for exactly this purpose.
pub const APPLICATION_ID: i32 = 0x4D4D_5453; // "MMTS"

/// Schema version stamped into `user_version`. Version 2 adds the Module 3
/// tables (customers, bills, bill_items); version 3 adds the customer's
/// password; version 4 adds the bill's wallet numbers. An older store is
/// migrated additively the first time it is opened (`schema::migrate`).
pub const SCHEMA_VERSION: i32 = 4;

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

/// Everything that can go wrong below the command layer. Mapped to the IPC error
/// enum in `commands::error` so the frontend never parses a string.
#[derive(Debug)]
pub enum StoreError {
    Sqlite(rusqlite::Error),
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
    /// The statement exists but carries no attachment.
    NoAttachment,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Sqlite(e) => write!(f, "The store could not be read: {e}"),
            StoreError::Io(e) => write!(f, "The store could not be reached: {e}"),
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
            StoreError::InvalidRange => write!(
                f,
                "The From date must be on or before the To date."
            ),
            StoreError::UnknownStatement => write!(f, "That statement no longer exists."),
            StoreError::UnknownBill => write!(f, "That bill no longer exists."),
            StoreError::NoAttachment => write!(f, "That statement has no attached file."),
        }
    }
}

impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        StoreError::Sqlite(error)
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

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Decide whether a file is one of our stores, **without writing to it**.
///
/// The order is cheapest-first (research R6): a read that forces SQLite to
/// validate the file header, then the application marker, then the schema
/// version, then the tables themselves. `PRAGMA integrity_check` is deliberately
/// *not* run here — it scans the whole file, which is unacceptable on every open.
pub fn verify_read_only(path: &Path) -> StoreResult<Verification> {
    if !path.exists() {
        return Ok(Verification::NotOurs(StoreProblem::Unreachable));
    }

    // READ_ONLY and no CREATE flag: this path can never modify or create a file.
    let conn = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(conn) => conn,
        Err(rusqlite::Error::SqliteFailure(code, _)) if code.code == ErrorCode::CannotOpen => {
            return Ok(Verification::NotOurs(StoreProblem::Unreachable));
        }
        Err(error) => return Err(error.into()),
    };

    // SQLite validates the file header on the first read, not necessarily at open.
    match conn.query_row("SELECT count(*) FROM sqlite_master", [], |row| {
        row.get::<_, i64>(0)
    }) {
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(code, _)) if code.code == ErrorCode::NotADatabase => {
            return Ok(Verification::NotOurs(StoreProblem::NotAStore(
                "That file is not a database, so it is not one of this application's records \
                 files."
                    .to_string(),
            )));
        }
        Err(rusqlite::Error::SqliteFailure(code, _))
            if matches!(code.code, ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase) =>
        {
            return Ok(Verification::NotOurs(StoreProblem::Damaged));
        }
        Err(error) => return Err(error.into()),
    }

    let application_id: i32 =
        conn.pragma_query_value(None, "application_id", |row| row.get(0))?;
    if application_id != APPLICATION_ID {
        return Ok(Verification::NotOurs(StoreProblem::NotAStore(
            "That file belongs to a different application, so it is not one of this \
             application's records files."
                .to_string(),
        )));
    }

    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 || version > SCHEMA_VERSION {
        return Ok(Verification::NotOurs(StoreProblem::NotAStore(format!(
            "That file was written in a shape this version of the application does not \
             understand (version {version})."
        ))));
    }

    // A version-1 store legitimately lacks the Module 3 tables; only a version-2
    // store must have them. The version is checked above, so this stays cheap.
    let required: &[&str] = if version >= 4 {
        &REQUIRED_TABLES_V4
    } else if version >= 2 {
        &REQUIRED_TABLES_V2
    } else {
        &REQUIRED_TABLES_V1
    };
    for table in required {
        if !conn.table_exists(None, *table)? {
            return Ok(Verification::NotOurs(StoreProblem::NotAStore(
                "That file is a database but does not hold this application's records.".to_string(),
            )));
        }
    }

    // "Empty" means nothing to lose: no statements and, where the tables exist,
    // no bills either (FR-064, Module 3).
    let statements: i64 = conn.query_row("SELECT count(*) FROM statements", [], |row| row.get(0))?;
    let bills: i64 = if version >= 2 {
        conn.query_row("SELECT count(*) FROM bills", [], |row| row.get(0))?
    } else {
        0
    };
    Ok(Verification::Ours {
        empty: statements == 0 && bills == 0,
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Open a store for reading and writing, creating the file and schema if needed.
///
/// The journal mode is left at SQLite's default rollback journal (research R2):
/// with WAL, committed data can live in `-wal`/`-shm` sidecars, which would make
/// "copy the one file as your backup" quietly false (FR-057, FR-058).
pub fn open_read_write(path: &Path) -> StoreResult<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )?;

    // `journal_mode` returns its new value, so it is read rather than executed.
    let mode: String = conn.query_row("PRAGMA journal_mode=DELETE", [], |row| row.get(0))?;
    debug_assert_eq!(mode.to_lowercase(), "delete");
    conn.pragma_update(None, "synchronous", "FULL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    Ok(conn)
}

/// Open an existing store read-write after verifying it is ours, bringing its
/// schema forward if it was written by an earlier version of the application.
///
/// A version-1 store (statements only) is migrated additively here, so opening
/// the practitioner's existing records after this module ships needs no separate
/// step and loses nothing (`schema::migrate`, data-model §1.4).
pub fn open_existing(path: &Path) -> StoreResult<Connection> {
    match verify_read_only(path)? {
        Verification::Ours { .. } => {}
        Verification::NotOurs(problem) => return Err(problem.into()),
    }
    let conn = open_read_write(path)?;
    schema::migrate(&conn)?;
    Ok(conn)
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
