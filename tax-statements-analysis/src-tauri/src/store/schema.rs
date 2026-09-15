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

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Create the schema if it is missing and stamp the file as ours.
///
/// `application_id` is written even for a store created moments ago: it is what
/// `verify_read_only` checks before anything else, and what makes a plain SQLite
/// file belonging to some other program recognisably not ours (research R6).
pub fn apply(conn: &Connection, creator_version: &str) -> StoreResult<()> {
    conn.execute_batch(DDL)?;

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
