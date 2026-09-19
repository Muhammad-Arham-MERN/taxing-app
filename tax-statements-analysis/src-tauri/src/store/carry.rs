// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Carrying records from one store into another when the practitioner points the
//! application at a new location (FR-019, FR-020).
//!
//! One transaction **per statement**, and any statement already present in the
//! destination is skipped and left alone (FR-063). Together those two rules make
//! the whole operation idempotent, and therefore resumable: a run interrupted by
//! a crash or a full disk can simply be run again, copying only what is missing
//! (research R7, FR-021).

use super::{attachments, customers};
use super::{open_read_write, verify_read_only, StoreError, StoreResult, Verification};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use std::path::Path;

#[derive(Debug, Default)]
pub struct CarryReport {
    pub copied: u64,
    pub skipped: u64,
}

/// Open the source store **read-only**. The store being read from is never
/// modified by a carry-across, which is what lets an interruption leave it
/// usable (FR-021).
fn open_source_read_only(path: &Path) -> StoreResult<Connection> {
    match verify_read_only(path)? {
        Verification::Ours { .. } => {}
        Verification::NotOurs(problem) => return Err(problem.into()),
    }
    Ok(Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Bring every statement from `source_path` into the open destination store.
///
/// Statements already present in the destination are counted as skipped and are
/// **not** altered there, so a carry-across can never duplicate a record or
/// overwrite a newer version of one (FR-063, SC-021).
pub fn carry_from(dst: &mut Connection, source_path: &Path) -> StoreResult<CarryReport> {
    let src = open_source_read_only(source_path)?;

    let ids: Vec<String> = {
        let mut stmt = src.prepare("SELECT id FROM statements ORDER BY created_at ASC, id ASC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<String>>>()?
    };

    let mut report = CarryReport::default();

    for id in &ids {
        let already_there: bool = dst
            .query_row(
                "SELECT 1 FROM statements WHERE id = ?1",
                params![id],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        if already_there {
            report.skipped += 1;
            continue;
        }

        let tx = dst.transaction()?;
        copy_statement(&tx, &src, id)?;
        tx.commit()?;
        report.copied += 1;
    }

    // Module 3: the practitioner's billing record moves with their statements.
    // Customers first, then bills, then their line items — the foreign keys
    // require that order (`specs/003-bills-invoice/data-model.md` §5).
    carry_customers(dst, &src)?;
    carry_bills(dst, &src)?;
    advance_invoice_counter(dst, &src)?;

    Ok(report)
}

/// Copy every remembered customer the destination does not already have. A name
/// already present is left exactly as it is, so a carry can never overwrite a
/// newer version.
fn carry_customers(dst: &Connection, src: &Connection) -> StoreResult<()> {
    for customer in customers::list(src)? {
        let present: bool = dst
            .query_row(
                "SELECT 1 FROM customers WHERE name = ?1",
                params![customer.name],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        if !present {
            customers::upsert_within(dst, &customer)?;
        }
    }
    Ok(())
}

/// Copy every bill and its line items that the destination lacks.
///
/// A bill is skipped when its identity **or its invoice number** is already
/// present, so copying two stores that happen to share a numbering range cannot
/// collide on the unique invoice number.
fn carry_bills(dst: &mut Connection, src: &Connection) -> StoreResult<()> {
    let bills: Vec<(String, i64)> = {
        let mut stmt = src.prepare("SELECT id, invoice_seq FROM bills ORDER BY created_at ASC, id ASC")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    for (id, invoice_seq) in &bills {
        let present: bool = dst
            .query_row(
                "SELECT 1 FROM bills WHERE id = ?1 OR invoice_seq = ?2",
                params![id, invoice_seq],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        if present {
            continue;
        }

        let tx = dst.transaction()?;
        copy_bill(&tx, src, id)?;
        tx.commit()?;
    }
    Ok(())
}

/// Copy one bill and its line items inside the caller's transaction.
fn copy_bill(dst: &Connection, src: &Connection, id: &str) -> StoreResult<()> {
    let row = src
        .query_row(
            "SELECT invoice_no, invoice_seq, occurred_on, customer_name, jazzcash, easypaisa,
                    account_holder, created_at, updated_at
               FROM bills WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .optional()?
        .ok_or(StoreError::UnknownBill)?;

    dst.execute(
        "INSERT INTO bills
             (id, invoice_no, invoice_seq, occurred_on, customer_name,
              jazzcash, easypaisa, account_holder, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id, row.0, row.1, row.2, row.3, row.4, row.5, row.6, row.7, row.8
        ],
    )?;

    let items: Vec<(String, i64, String, i64)> = {
        let mut stmt = src.prepare(
            "SELECT id, position, details, amount_minor
               FROM bill_items WHERE bill_id = ?1 ORDER BY position ASC",
        )?;
        let rows = stmt.query_map(params![id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    for (item_id, position, details, amount_minor) in items {
        dst.execute(
            "INSERT INTO bill_items (id, bill_id, position, details, amount_minor)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![item_id, id, position, details, amount_minor],
        )?;
    }

    let wallets: Vec<(String, i64, String)> = {
        let mut stmt = src.prepare(
            "SELECT kind, position, number
               FROM bill_wallets WHERE bill_id = ?1 ORDER BY kind, position",
        )?;
        let rows = stmt.query_map(params![id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    for (kind, position, number) in wallets {
        dst.execute(
            "INSERT INTO bill_wallets (bill_id, kind, position, number)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, kind, position, number],
        )?;
    }

    Ok(())
}

/// Make sure the destination's invoice counter is at least the source's, so a
/// number that has already been issued can never be issued again there
/// (FR-019, SC-021).
fn advance_invoice_counter(dst: &Connection, src: &Connection) -> StoreResult<()> {
    let read = |conn: &Connection| -> StoreResult<Option<i64>> {
        Ok(conn
            .query_row(
                "SELECT CAST(value AS INTEGER) FROM app_meta WHERE key = 'next_invoice_no'",
                [],
                |row| row.get(0),
            )
            .optional()?)
    };

    let Some(source_next) = read(src)? else {
        return Ok(());
    };

    let merged = read(dst)?.unwrap_or(1).max(source_next);
    dst.execute(
        "INSERT INTO app_meta (key, value) VALUES ('next_invoice_no', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        params![merged.to_string()],
    )?;

    Ok(())
}

/// Copy one statement and its attachment inside the caller's transaction.
fn copy_statement(dst: &Connection, src: &Connection, id: &str) -> StoreResult<()> {
    let row = src
        .query_row(
            "SELECT occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at
               FROM statements WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()?
        .ok_or(StoreError::UnknownStatement)?;

    dst.execute(
        "INSERT INTO statements
             (id, occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            row.0,
            row.1,
            row.2,
            row.3,
            row.4,
            row.5,
            row.6
        ],
    )?;

    if attachments::file_name(src, id)?.is_some() {
        attachments::copy_from(dst, id, src, id)?;
    }

    Ok(())
}

/// How many statements a store file holds. Paired with `remaining`, this lets an
/// interrupted carry-across report honestly how far it actually got.
pub fn statement_count(source_path: &Path) -> StoreResult<u64> {
    let src = open_source_read_only(source_path)?;
    Ok(src.query_row("SELECT count(*) FROM statements", [], |row| {
        row.get::<_, i64>(0)
    })? as u64)
}

/// Number of statements a destination is still missing from a source. Used to
/// report how much is left after an interrupted run.
pub fn remaining(dst: &Connection, source_path: &Path) -> StoreResult<u64> {
    let src = open_source_read_only(source_path)?;
    let mut stmt = src.prepare("SELECT id FROM statements")?;
    let ids = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut remaining = 0u64;
    for id in ids {
        let id = id?;
        let present: bool = dst
            .query_row(
                "SELECT 1 FROM statements WHERE id = ?1",
                params![id],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if !present {
            remaining += 1;
        }
    }
    Ok(remaining)
}

/// Create a fresh store at `path` (used when the practitioner picks a folder).
pub fn create_store(path: &Path, creator_version: &str) -> StoreResult<()> {
    let conn = open_read_write(path)?;
    super::schema::apply(&conn, creator_version)?;
    Ok(())
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
