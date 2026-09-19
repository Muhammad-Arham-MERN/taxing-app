// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Schema creation and the identity stamp that lets us recognise our own file.
//!
//! Shape and rationale: `specs/002-statements-persistence/data-model.md` §1.

use super::{StoreResult, APPLICATION_ID, SCHEMA_VERSION};
use rusqlite::Connection;

/// The whole schema. `data` is deliberately the **last** column of `attachments`
/// and is never selected by a range query: SQLite reads a row's overflow pages
/// only when it must advance past the overflowing column, which is what makes
/// "a range review loads no file contents" a property of the schema rather than
/// a rule implementers must remember (research R3, FR-029, SC-011).
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
    statement_id TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
    file_name    TEXT    NOT NULL,
    byte_size    INTEGER NOT NULL,
    data         BLOB    NOT NULL
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

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Create the schema if it is missing and stamp the file as ours.
///
/// `application_id` is written even for a store created moments ago: it is what
/// `verify_read_only` checks before anything else, and what makes a plain SQLite
/// file belonging to some other program recognisably not ours (research R6).
pub fn apply(conn: &Connection, creator_version: &str) -> StoreResult<()> {
    conn.execute_batch(DDL)?;
    conn.execute_batch(DDL_V2)?;
    conn.execute_batch(DDL_V4)?;

    conn.pragma_update(None, "application_id", APPLICATION_ID)?;
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;

    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('created_at', ?1)
         ON CONFLICT(key) DO NOTHING",
        [now_iso()],
    )?;
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('creator_version', ?1)
         ON CONFLICT(key) DO NOTHING",
        [creator_version],
    )?;

    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Bring a store forward to the current schema version, additively.
///
/// Only the steps a store is missing are run, and `user_version` is stamped
/// **last**, so an interrupted migration is completed simply by opening again:
/// every statement is idempotent (`specs/003-bills-invoice/data-model.md` §1.4).
pub fn migrate(conn: &Connection) -> StoreResult<()> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 2 {
        conn.execute_batch(DDL_V2)?;
    }

    // Version 3 adds the customer's password. A store migrated from version 1
    // already has the column from the DDL above, so it is added only when it is
    // actually missing.
    if version < 3 && !column_exists(conn, "customers", "password")? {
        conn.execute_batch("ALTER TABLE customers ADD COLUMN password TEXT;")?;
    }

    // Version 4 moves the single wallet numbers onto their own ordered table.
    // Whatever the bills already carried is copied across; the legacy columns are
    // left as they are and never written again.
    if version < 4 {
        conn.execute_batch(DDL_V4)?;
        conn.execute_batch(
            "INSERT INTO bill_wallets (bill_id, kind, position, number)
                 SELECT id, 'jazzcash', 1, jazzcash FROM bills
                  WHERE jazzcash IS NOT NULL AND TRIM(jazzcash) <> ''
                 ON CONFLICT(bill_id, kind, position) DO NOTHING;
             INSERT INTO bill_wallets (bill_id, kind, position, number)
                 SELECT id, 'easypaisa', 1, easypaisa FROM bills
                  WHERE easypaisa IS NOT NULL AND TRIM(easypaisa) <> ''
                 ON CONFLICT(bill_id, kind, position) DO NOTHING;",
        )?;
    }

    if version < SCHEMA_VERSION {
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }

    Ok(())
}

/// Whether a table already has a column. SQLite has no `ADD COLUMN IF NOT
/// EXISTS`, so this is what keeps the migration idempotent.
fn column_exists(conn: &Connection, table: &str, column: &str) -> StoreResult<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
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

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
