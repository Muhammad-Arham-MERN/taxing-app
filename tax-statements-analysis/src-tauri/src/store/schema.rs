// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Schema creation and the identity stamp that lets us recognise our own file.
//!
//! Shape and rationale: `specs/002-statements-persistence/data-model.md` §1, and
//! for the version-5 change `specs/004-cloud-sync/data-model.md` §1.2/§1.4.
//!
//! Everything here is written for the async Turso engine (research R2). The DDL
//! is SQLite-compatible; the R1 spike proved `STRICT`, `CHECK`, `COLLATE NOCASE`,
//! foreign keys, `PRAGMA table_info` and `PRAGMA user_version` all behave.

use super::object_cache::{ObjectCache, Scope};
use super::{app_meta_value, pragma_i64, StoreResult, APPLICATION_ID};
use std::path::Path;
use turso::{params::Params, Connection, Value};

/// The `app_meta` key that carries this store's **identity as data**.
///
/// The local file's header belongs to the sync engine when the store is synced —
/// it reads `application_id = 0` and `user_version = 0` — so ownership cannot be
/// proved from the header. A row, by contrast, travels with the database, so the
/// marker is present on every machine that pulls the store (research R2).
pub const OWNERSHIP_KEY: &str = "ownership";

/// The identity value written under [`OWNERSHIP_KEY`]. Nothing else uses it, so
/// a foreign database can never carry it by accident.
pub const OWNERSHIP_VALUE: &str = "tax-statements-analysis";

/// The `app_meta` key that mirrors the schema version, for the same reason: the
/// header's `user_version` is not ours to trust on a synced store.
pub const VERSION_KEY: &str = "schema_version";

/// The whole schema. The `attachments` table holds the file **bytes** no longer:
/// from version 8 it keeps an `object_key` — a string reference into Oracle
/// Object Storage — plus the file's name, size and content type. The bytes live
/// in the object store and, offline, in the local-only cache.
const DDL: &str = r#"
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS statements (
    id           TEXT    PRIMARY KEY,
    occurred_on  TEXT    NOT NULL,
    kind         TEXT    NOT NULL CHECK (kind IN ('inflow','outflow')),
    nature       TEXT    NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    remarks      TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS attachments (
    statement_id  TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
    file_name     TEXT    NOT NULL,
    byte_size     INTEGER NOT NULL,
    content_type  TEXT,
    object_key    TEXT    NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_statements_range
    ON statements(occurred_on DESC, created_at DESC);
"#;

/// The version-2 tables (Module 3): customers, bills and line items
/// (`specs/003-bills-invoice/data-model.md` §1.2). Every statement is
/// `IF NOT EXISTS`, so this same batch both creates the tables in a fresh store
/// and migrates a version-1 store additively.
const DDL_V2: &str = r#"
CREATE TABLE IF NOT EXISTS customers (
    name           TEXT COLLATE NOCASE PRIMARY KEY,
    address        TEXT,
    contact_person TEXT,
    contact_number TEXT,
    email          TEXT,
    ntn            TEXT,
    password       TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS bills (
    id             TEXT    PRIMARY KEY,
    invoice_no     TEXT    NOT NULL UNIQUE,
    invoice_seq    INTEGER NOT NULL UNIQUE,
    occurred_on    TEXT    NOT NULL,
    customer_name  TEXT    NOT NULL COLLATE NOCASE REFERENCES customers(name),
    jazzcash       TEXT,
    easypaisa      TEXT,
    account_holder TEXT    NOT NULL,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bills_range
    ON bills(occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_customer
    ON bills(customer_name, occurred_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS bill_items (
    id           TEXT    PRIMARY KEY,
    bill_id      TEXT    NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL CHECK (position > 0),
    details      TEXT    NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    UNIQUE (bill_id, position)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bill_items_bill
    ON bill_items(bill_id, position);

INSERT INTO app_meta(key, value) VALUES ('next_invoice_no', '1')
    ON CONFLICT(key) DO NOTHING;
"#;

/// The version-4 table (client change, 2026-09-19): a bill may carry as many
/// JazzCash and Easypaisa numbers as the practitioner wants, so they live in
/// their own ordered table rather than one column each. `bills.jazzcash` and
/// `bills.easypaisa` are left in place as legacy columns whose values are copied
/// across by the migration and never written again.
const DDL_V4: &str = r#"
CREATE TABLE IF NOT EXISTS bill_wallets (
    bill_id  TEXT    NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    kind     TEXT    NOT NULL CHECK (kind IN ('jazzcash','easypaisa')),
    position INTEGER NOT NULL CHECK (position > 0),
    number   TEXT    NOT NULL,
    PRIMARY KEY (bill_id, kind, position)
) STRICT;
"#;

/// The version-6 tables: **clients**, the contact book, keyed by CNIC.
///
/// A client's contacts live in their own table so that two different emails — or
/// two different numbers — given for the same CNIC, on this machine or another,
/// both survive: they are separate rows. An identical value collides on the
/// primary key and collapses to one.
const DDL_V6: &str = r#"
CREATE TABLE IF NOT EXISTS clients (
    cnic       TEXT COLLATE NOCASE PRIMARY KEY,
    name       TEXT NOT NULL,
    company    TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS client_contacts (
    cnic  TEXT NOT NULL COLLATE NOCASE REFERENCES clients(cnic) ON DELETE CASCADE,
    kind  TEXT NOT NULL CHECK (kind IN ('phone','whatsapp','email')),
    value TEXT NOT NULL,
    PRIMARY KEY (cnic, kind, value)
) STRICT;
"#;

/// The version-7 tables: **categories**, the per-client **records**, and the
/// records' files.
///
/// Categories are one global, named, coloured list shared by clients and their
/// records. A record belongs to exactly one client (`ON DELETE CASCADE`, so
/// removing a client takes their records with them) and may carry one file. From
/// version 8 the file keeps an `object_key` reference rather than its bytes.
const DDL_V7: &str = r#"
CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS client_records (
    id          TEXT NOT NULL PRIMARY KEY,
    cnic        TEXT NOT NULL COLLATE NOCASE REFERENCES clients(cnic) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    occurred_on TEXT NOT NULL,
    remarks     TEXT,
    category_id TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_client_records_client
    ON client_records(cnic, occurred_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS client_record_files (
    record_id    TEXT    PRIMARY KEY REFERENCES client_records(id) ON DELETE CASCADE,
    file_name    TEXT    NOT NULL,
    byte_size    INTEGER NOT NULL,
    content_type TEXT,
    object_key   TEXT    NOT NULL
) STRICT;
"#;

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Create the schema if it is missing and stamp the file as ours.
///
/// `application_id` is written even for a store created moments ago: it is what
/// `verify_read_only` checks before anything else, and what makes a plain SQLite
/// file belonging to some other program recognisably not ours (research R6).
pub async fn apply(
    conn: &Connection,
    store_file: &Path,
    creator_version: &str,
) -> StoreResult<()> {
    crate::log_info!("schema::apply: creating the tables and stamping the file as ours");

    conn.execute_batch(DDL).await?;
    conn.execute_batch(DDL_V2).await?;
    conn.execute_batch(DDL_V4).await?;
    conn.execute_batch(DDL_V6).await?;
    conn.execute_batch(DDL_V7).await?;
    ensure_client_password_column(conn).await?;

    conn.execute(
        &format!("PRAGMA application_id = {APPLICATION_ID}"),
        (),
    )
    .await?;
    conn.execute(&format!("PRAGMA user_version = {}", super::SCHEMA_VERSION), ())
        .await?;
    crate::log_debug!(
        "schema::apply: application_id={APPLICATION_ID:#x}, user_version={}",
        super::SCHEMA_VERSION
    );

    let _ = store_file; // the DDL is self-contained; no path is needed.

    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('created_at', ?1)
         ON CONFLICT(key) DO NOTHING",
        [now_iso().as_str()],
    )
    .await?;
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('creator_version', ?1)
         ON CONFLICT(key) DO NOTHING",
        [creator_version],
    )
    .await?;

    // The identity and the version as **data**, so they survive on a synced store
    // whose file header the sync engine owns (research R2).
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO NOTHING",
        (OWNERSHIP_KEY, OWNERSHIP_VALUE),
    )
    .await?;
    let version_text = super::SCHEMA_VERSION.to_string();
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (VERSION_KEY, version_text.as_str()),
    )
    .await?;

    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The schema version of a store, read exactly as `verify_connection` reads it:
/// the file header when it is usable, otherwise the `app_meta` **content marker**.
///
/// This matters because the sync engine owns a *synced* store's file header, so
/// `PRAGMA user_version` reads `0` there. Taking that at face value would re-run
/// every migration step on every open — and, after a table has been re-shaped,
/// re-run an older step against the new shape. The marker travels with the data,
/// so it survives wherever the header does not.
pub async fn current_version(conn: &Connection) -> StoreResult<i64> {
    let header = pragma_i64(conn, "user_version").await?;
    if (1..=super::SCHEMA_VERSION).contains(&header) {
        return Ok(header);
    }
    let marker = app_meta_value(conn, VERSION_KEY)
        .await?
        .and_then(|value| value.trim().parse::<i64>().ok());
    match marker {
        Some(version) if (1..=super::SCHEMA_VERSION).contains(&version) => {
            crate::log_debug!("current_version: the header read {header}; using the marker {version}");
            Ok(version)
        }
        _ => Ok(header),
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Bring a store forward to the current schema version, additively.
///
/// Only the steps a store is missing are run, and `user_version` is stamped
/// **last**, so an interrupted migration is completed simply by opening again:
/// every statement is idempotent (`specs/003-bills-invoice/data-model.md` §1.4,
/// `specs/004-cloud-sync/data-model.md` §1.4).
pub async fn migrate(
    conn: &Connection,
    store_file: &Path,
    cache: &ObjectCache,
) -> StoreResult<()> {
    let version = current_version(conn).await?;
    crate::log_info!(
        "schema::migrate: store is at version {version}, current is {}",
        super::SCHEMA_VERSION
    );

    if version < 2 {
        crate::log_info!("schema::migrate: v{version} -> adding the Module 3 tables");
        conn.execute_batch(DDL_V2).await?;
    }

    // Version 3 adds the customer's password. A store migrated from version 1
    // already has the column from the DDL above, so it is added only when it is
    // actually missing.
    if version < 3 && !column_exists(conn, "customers", "password").await? {
        crate::log_info!("schema::migrate: adding the customers.password column");
        conn.execute_batch("ALTER TABLE customers ADD COLUMN password TEXT;")
            .await?;
    }

    // Version 4 moves the single wallet numbers onto their own ordered table.
    if version < 4 {
        crate::log_info!("schema::migrate: adding the bill_wallets table");
        conn.execute_batch(DDL_V4).await?;
        conn.execute_batch(
            "INSERT INTO bill_wallets (bill_id, kind, position, number)
                 SELECT id, 'jazzcash', 1, jazzcash FROM bills
                  WHERE jazzcash IS NOT NULL AND TRIM(jazzcash) <> ''
                 ON CONFLICT(bill_id, kind, position) DO NOTHING;
             INSERT INTO bill_wallets (bill_id, kind, position, number)
                 SELECT id, 'easypaisa', 1, easypaisa FROM bills
                  WHERE easypaisa IS NOT NULL AND TRIM(easypaisa) <> ''
                 ON CONFLICT(bill_id, kind, position) DO NOTHING;",
        )
        .await?;
    }

    // Version 6: the client tables, and attachment **bytes** back inside the
    // store (a v5 store kept them in the `attachments/` folder beside it).
    if version < 6 {
        crate::log_info!(
            "schema::migrate: adding the client tables and bringing attachment bytes back in (v6)"
        );
        conn.execute_batch(DDL_V6).await?;
        migrate_attachments_in(conn, store_file).await?;
    }

    // Version 7: the shared categories and the per-client records, with their
    // files. (The client's own `password` column is added just below, whenever it
    // is missing, rather than only when the version is below 7 — a store already
    // stamped 7 by an earlier build may still lack it.)
    if version < 7 {
        crate::log_info!("schema::migrate: adding categories and client records (v7)");
        conn.execute_batch(DDL_V7).await?;
    }

    // Version 8: every file's bytes leave the store for Oracle Object Storage.
    // There is **no network here** — the bytes are written to the local-only
    // cache marked pending, and `files::drain_pending` sends them the next time
    // the application is online. This is what lets an upgrade complete offline.
    if version < 8 {
        crate::log_info!("schema::migrate: moving file bytes to object storage (v8)");
        move_attachments_to_objects(conn, cache).await?;
        move_record_files_to_objects(conn, cache).await?;
    }

    // Guarded and idempotent, so it runs at every version and always leaves the
    // client table in the shape the queries expect.
    ensure_client_password_column(conn).await?;

    if version < super::SCHEMA_VERSION {
        conn.execute(
            &format!("PRAGMA user_version = {}", super::SCHEMA_VERSION),
            (),
        )
        .await?;
        crate::log_info!(
            "schema::migrate: store brought forward to version {}",
            super::SCHEMA_VERSION
        );
    }

    // Keep the content identity in step: a store created before these rows existed
    // gains them here, so it is recognised by its content from now on.
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO NOTHING",
        (OWNERSHIP_KEY, OWNERSHIP_VALUE),
    )
    .await?;
    let version_text = super::SCHEMA_VERSION.to_string();
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (VERSION_KEY, version_text.as_str()),
    )
    .await?;

    Ok(())
}

/// v4/v5 → v6: make `attachments` hold the file **bytes** again.
///
/// A v5 store kept them in `<store-dir>/attachments/<id>.bin` and left only a
/// reference row; a v4 store still had the `data` column itself. Idempotent: a
/// table already in the v6 shape is left alone, so a re-run after an interruption
/// simply finishes the job. A reference whose file has gone is carried over with
/// empty bytes rather than dropped, mirroring the old migration's tolerance.
async fn migrate_attachments_in(conn: &Connection, store_file: &Path) -> StoreResult<()> {
    let has_data = column_exists(conn, "attachments", "data").await?;
    let has_reference = column_exists(conn, "attachments", "relative_path").await?;

    if has_data && !has_reference {
        crate::log_debug!(
            "migrate_attachments_in: the store already holds the bytes — nothing to do"
        );
        return Ok(());
    }

    // Neither the bytes nor a reference: the table is already in a later shape
    // (v8 keeps an `object_key`). Nothing to bring in, and querying either column
    // would fail — so this guard also makes the step safe to re-run.
    if !has_data && !has_reference {
        crate::log_debug!("migrate_attachments_in: the table is already past this shape — nothing to do");
        return Ok(());
    }

    let folder = store_file
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("attachments");

    let select = if has_data {
        "SELECT statement_id, file_name, byte_size, data FROM attachments"
    } else {
        "SELECT statement_id, file_name, byte_size, relative_path FROM attachments"
    };
    let mut rows = conn.query(select, ()).await?;

    let mut items: Vec<(String, String, i64, Vec<u8>)> = Vec::new();
    while let Some(row) = rows.next().await? {
        let statement_id = match row.get_value(0)? {
            Value::Text(text) => text,
            _ => continue,
        };
        let file_name = match row.get_value(1)? {
            Value::Text(text) => text,
            _ => String::new(),
        };
        let byte_size = match row.get_value(2)? {
            Value::Integer(number) => number,
            _ => 0,
        };
        // Already here (v4), or read back from the folder (v5).
        let bytes = if has_data {
            match row.get_value(3)? {
                Value::Blob(bytes) => bytes,
                _ => Vec::new(),
            }
        } else {
            std::fs::read(folder.join(format!("{statement_id}.bin"))).unwrap_or_default()
        };
        items.push((statement_id, file_name, byte_size, bytes));
    }
    drop(rows);

    crate::log_info!(
        "migrate_attachments_in: {} attachment(s) rewritten with their bytes",
        items.len()
    );

    // Rebuild the table to the byte-holding shape, then copy the rows across.
    conn.execute_batch(
        "DROP TABLE attachments;
         CREATE TABLE attachments (
             statement_id  TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
             file_name     TEXT    NOT NULL,
             byte_size     INTEGER NOT NULL,
             data          BLOB    NOT NULL
         ) STRICT;",
    )
    .await?;

    for (statement_id, file_name, byte_size, bytes) in items {
        conn.execute(
            "INSERT INTO attachments (statement_id, file_name, byte_size, data)
             VALUES (?1, ?2, ?3, ?4)",
            Params::Positional(vec![
                Value::Text(statement_id),
                Value::Text(file_name),
                Value::Integer(byte_size),
                Value::Blob(bytes),
            ]),
        )
        .await?;
    }

    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// v7 → v8 for statements: read each attachment's `data` BLOB, write the bytes
/// to the object store's cache (marked pending), then rebuild `attachments` to
/// hold an object reference. Idempotent — a table already without `data` is left
/// alone, so a re-run after an interruption simply finishes the job.
async fn move_attachments_to_objects(conn: &Connection, cache: &ObjectCache) -> StoreResult<()> {
    if !column_exists(conn, "attachments", "data").await? {
        crate::log_debug!("move_attachments_to_objects: already an object reference — nothing to do");
        return Ok(());
    }

    let mut rows = conn
        .query("SELECT statement_id, file_name, byte_size, data FROM attachments", ())
        .await?;
    let mut items: Vec<(String, String, i64, String)> = Vec::new();
    while let Some(row) = rows.next().await? {
        let statement_id = match row.get_value(0)? {
            Value::Text(text) => text,
            _ => continue,
        };
        let file_name = match row.get_value(1)? {
            Value::Text(text) => text,
            _ => String::new(),
        };
        let byte_size = match row.get_value(2)? {
            Value::Integer(number) => number,
            _ => 0,
        };
        let bytes = match row.get_value(3)? {
            Value::Blob(bytes) => bytes,
            _ => Vec::new(),
        };
        let object_key = crate::files::new_object_key();
        cache
            .put(&object_key, Scope::Statement, &file_name, None, &bytes)
            .await?;
        items.push((statement_id, file_name, byte_size, object_key));
    }
    drop(rows);

    crate::log_info!(
        "move_attachments_to_objects: {} attachment(s) moved to the object store",
        items.len()
    );

    conn.execute_batch(
        "DROP TABLE attachments;
         CREATE TABLE attachments (
             statement_id  TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
             file_name     TEXT    NOT NULL,
             byte_size     INTEGER NOT NULL,
             content_type  TEXT,
             object_key    TEXT    NOT NULL
         ) STRICT;",
    )
    .await?;

    for (statement_id, file_name, byte_size, object_key) in items {
        conn.execute(
            "INSERT INTO attachments (statement_id, file_name, byte_size, content_type, object_key)
             VALUES (?1, ?2, ?3, NULL, ?4)",
            Params::Positional(vec![
                Value::Text(statement_id),
                Value::Text(file_name),
                Value::Integer(byte_size),
                Value::Text(object_key),
            ]),
        )
        .await?;
    }
    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// v7 → v8 for client records: the same move as `move_attachments_to_objects`,
/// for `client_record_files`.
async fn move_record_files_to_objects(conn: &Connection, cache: &ObjectCache) -> StoreResult<()> {
    if !column_exists(conn, "client_record_files", "data").await? {
        crate::log_debug!("move_record_files_to_objects: already an object reference — nothing to do");
        return Ok(());
    }

    let mut rows = conn
        .query("SELECT record_id, file_name, byte_size, data FROM client_record_files", ())
        .await?;
    let mut items: Vec<(String, String, i64, String)> = Vec::new();
    while let Some(row) = rows.next().await? {
        let record_id = match row.get_value(0)? {
            Value::Text(text) => text,
            _ => continue,
        };
        let file_name = match row.get_value(1)? {
            Value::Text(text) => text,
            _ => String::new(),
        };
        let byte_size = match row.get_value(2)? {
            Value::Integer(number) => number,
            _ => 0,
        };
        let bytes = match row.get_value(3)? {
            Value::Blob(bytes) => bytes,
            _ => Vec::new(),
        };
        let object_key = crate::files::new_object_key();
        cache
            .put(&object_key, Scope::Record, &file_name, None, &bytes)
            .await?;
        items.push((record_id, file_name, byte_size, object_key));
    }
    drop(rows);

    crate::log_info!(
        "move_record_files_to_objects: {} record file(s) moved to the object store",
        items.len()
    );

    conn.execute_batch(
        "DROP TABLE client_record_files;
         CREATE TABLE client_record_files (
             record_id    TEXT    PRIMARY KEY REFERENCES client_records(id) ON DELETE CASCADE,
             file_name    TEXT    NOT NULL,
             byte_size    INTEGER NOT NULL,
             content_type TEXT,
             object_key   TEXT    NOT NULL
         ) STRICT;",
    )
    .await?;

    for (record_id, file_name, byte_size, object_key) in items {
        conn.execute(
            "INSERT INTO client_record_files (record_id, file_name, byte_size, content_type, object_key)
             VALUES (?1, ?2, ?3, NULL, ?4)",
            Params::Positional(vec![
                Value::Text(record_id),
                Value::Text(file_name),
                Value::Integer(byte_size),
                Value::Text(object_key),
            ]),
        )
        .await?;
    }
    Ok(())
}

/// Add the client's `password` column when it is not already present. SQLite has
/// no `ADD COLUMN IF NOT EXISTS`, so the check is explicit and the call is
/// therefore **idempotent**: it is safe to run on a fresh store (`apply`) and on
/// *every* open (`migrate`), which is what lets a store stamped version 7 by an
/// earlier build still pick the column up.
async fn ensure_client_password_column(conn: &Connection) -> StoreResult<()> {
    if !column_exists(conn, "clients", "password").await? {
        crate::log_info!("schema: adding the clients.password column");
        conn.execute("ALTER TABLE clients ADD COLUMN password TEXT", ())
            .await?;
    }
    Ok(())
}

/// Whether a table already has a column. SQLite has no `ADD COLUMN IF NOT
/// EXISTS`, so this is what keeps the migration idempotent.
pub async fn column_exists(conn: &Connection, table: &str, column: &str) -> StoreResult<bool> {
    let mut rows = conn
        .query(&format!("PRAGMA table_info({table})"), ())
        .await?;
    while let Some(row) = rows.next().await? {
        if let Value::Text(name) = row.get_value(1)? {
            if name == column {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

pub fn now_iso() -> String {
    // A UTC timestamp in ISO 8601, without pulling in a date-time crate for the
    // two places this module needs one.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();

    let days = secs / 86_400;
    let seconds_of_day = secs % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// Days since the Unix epoch to a civil date (Howard Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
