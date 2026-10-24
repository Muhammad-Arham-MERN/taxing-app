// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Carrying records from one store into another when the practitioner points the
//! application at a new location (FR-019, FR-020).
//!
//! One transaction **per statement**, and any statement already present in the
//! destination is skipped and left alone (FR-063). Together those two rules make
//! the whole operation idempotent, and therefore resumable (research R7, FR-021).
//!
//! Module 4 extends this to move the **`attachments/` folder** beside the store
//! as well (data-model §5): the bytes live outside the store now, so a location
//! change must bring them too.

use super::attachments;
use super::{clients, customers, verify_read_only, StoreError, StoreResult, Verification};
use std::path::Path;
use turso::{Builder, Connection, Value};

#[derive(Debug, Default)]
pub struct CarryReport {
    pub copied: u64,
    pub skipped: u64,
}

/// Open the source store **read-only**. The store being read from is never
/// modified by a carry-across, which is what lets an interruption leave it
/// usable (FR-021).
async fn open_source_read_only(path: &Path) -> StoreResult<(turso::Database, Connection)> {
    crate::log_debug!("carry::open_source_read_only: {}", path.display());
    match verify_read_only(path).await? {
        Verification::Ours { .. } => {}
        Verification::NotOurs(problem) => {
            crate::log_error!("carry: the source store was rejected: {problem:?}");
            return Err(problem.into());
        }
    }
    let db = Builder::new_local(&path.to_string_lossy())
        .read_only(true)
        .build()
        .await?;
    let conn = db.connect()?;
    Ok((db, conn))
}

fn text_at(row: &turso::Row, index: usize) -> String {
    match row.get_value(index) {
        Ok(Value::Text(text)) => text,
        _ => String::new(),
    }
}

fn optional_text_at(row: &turso::Row, index: usize) -> Option<String> {
    match row.get_value(index) {
        Ok(Value::Text(text)) => Some(text),
        _ => None,
    }
}

fn integer_at(row: &turso::Row, index: usize) -> i64 {
    match row.get_value(index) {
        Ok(Value::Integer(number)) => number,
        _ => 0,
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Bring every statement from `source_path` into the open destination store.
///
/// Statements already present in the destination are counted as skipped and are
/// **not** altered there, so a carry-across can never duplicate a record or
/// overwrite a newer version of one (FR-063, SC-021).
pub async fn carry_from(
    dst: &Connection,
    dst_store_file: &Path,
    source_path: &Path,
) -> StoreResult<CarryReport> {
    crate::log_info!(
        "carry::carry_from: bringing records from {} into {}",
        source_path.display(),
        dst_store_file.display()
    );
    let (_src_db, src) = open_source_read_only(source_path).await?;
    let _ = dst_store_file;

    let ids = statement_ids(&src).await?;
    crate::log_info!("carry::carry_from: the source holds {} statement(s)", ids.len());

    let mut report = CarryReport::default();

    for id in &ids {
        let already_there = dst
            .query("SELECT 1 FROM statements WHERE id = ?1", [id.as_str()])
            .await?
            .next()
            .await?
            .is_some();

        if already_there {
            report.skipped += 1;
            continue;
        }

        let tx = dst.unchecked_transaction().await?;
        copy_statement(&tx, &src, id).await?;
        tx.commit().await?;
        report.copied += 1;
    }

    // Module 3/4: the practitioner's billing record moves with their statements.
    // Customers first, then bills, then their line items — the foreign keys
    // require that order (`specs/003-bills-invoice/data-model.md` §5).
    carry_customers(dst, &src).await?;
    carry_bills(dst, &src).await?;
    advance_invoice_counter(dst, &src).await?;
    carry_clients(dst, &src).await?;

    crate::log_info!(
        "carry::carry_from: done — {} copied, {} skipped",
        report.copied,
        report.skipped
    );
    Ok(report)
}

/// Every statement id in a store, oldest first.
async fn statement_ids(conn: &Connection) -> StoreResult<Vec<String>> {
    let mut rows = conn
        .query(
            "SELECT id FROM statements ORDER BY created_at ASC, id ASC",
            (),
        )
        .await?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(text_at(&row, 0));
    }
    Ok(out)
}

/// Copy every remembered customer the destination does not already have. A name
/// already present is left exactly as it is, so a carry can never overwrite a
/// newer version.
async fn carry_customers(dst: &Connection, src: &Connection) -> StoreResult<()> {
    let mut copied = 0u64;
    for customer in customers::list(src).await? {
        let present = dst
            .query("SELECT 1 FROM customers WHERE name = ?1", [customer.name.as_str()])
            .await?
            .next()
            .await?
            .is_some();

        if !present {
            customers::upsert_within(dst, &customer).await?;
            copied += 1;
        }
    }
    crate::log_info!("carry::carry_customers: {copied} customer(s) copied");
    Ok(())
}

/// Carry the client book across. The upsert merges, so a client already present in
/// the destination gains any contact values it did not have rather than being
/// replaced.
async fn carry_clients(dst: &Connection, src: &Connection) -> StoreResult<()> {
    let all = clients::list(src).await?;
    for client in &all {
        clients::upsert_within(dst, client).await?;
    }
    crate::log_info!("carry::carry_clients: {} client(s) carried", all.len());
    Ok(())
}

/// Copy every bill and its line items that the destination lacks.
///
/// A bill is skipped when its identity **or its invoice number** is already
/// present, so copying two stores that happen to share a numbering range cannot
/// collide on the unique invoice number.
async fn carry_bills(dst: &Connection, src: &Connection) -> StoreResult<()> {
    let bills: Vec<(String, i64)> = {
        let mut rows = src
            .query(
                "SELECT id, invoice_seq FROM bills ORDER BY created_at ASC, id ASC",
                (),
            )
            .await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? {
            out.push((text_at(&row, 0), integer_at(&row, 1)));
        }
        out
    };

    let mut copied = 0u64;
    for (id, invoice_seq) in &bills {
        let present = dst
            .query(
                "SELECT 1 FROM bills WHERE id = ?1 OR invoice_seq = ?2",
                (id.as_str(), *invoice_seq),
            )
            .await?
            .next()
            .await?
            .is_some();

        if present {
            continue;
        }

        let tx = dst.unchecked_transaction().await?;
        copy_bill(&tx, src, id).await?;
        tx.commit().await?;
        copied += 1;
    }
    crate::log_info!("carry::carry_bills: {copied} bill(s) copied");
    Ok(())
}

/// Copy one bill and its line items inside the caller's transaction.
async fn copy_bill(dst: &Connection, src: &Connection, id: &str) -> StoreResult<()> {
    let mut rows = src
        .query(
            "SELECT invoice_no, invoice_seq, occurred_on, customer_name, jazzcash, easypaisa,
                    account_holder, created_at, updated_at
               FROM bills WHERE id = ?1",
            [id],
        )
        .await?;

    let Some(row) = rows.next().await? else {
        return Err(StoreError::UnknownBill);
    };
    let (invoice_no, invoice_seq, occurred_on, customer_name, jazzcash, easypaisa,
         account_holder, created_at, updated_at) = (
        text_at(&row, 0),
        integer_at(&row, 1),
        text_at(&row, 2),
        text_at(&row, 3),
        optional_text_at(&row, 4),
        optional_text_at(&row, 5),
        text_at(&row, 6),
        text_at(&row, 7),
        text_at(&row, 8),
    );
    drop(rows);

    dst.execute(
        "INSERT INTO bills
             (id, invoice_no, invoice_seq, occurred_on, customer_name,
              jazzcash, easypaisa, account_holder, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        (
            id,
            invoice_no.as_str(),
            invoice_seq,
            occurred_on.as_str(),
            customer_name.as_str(),
            jazzcash.as_deref(),
            easypaisa.as_deref(),
            account_holder.as_str(),
            created_at.as_str(),
            updated_at.as_str(),
        ),
    )
    .await?;

    copy_items(dst, src, id).await?;
    copy_wallets(dst, src, id).await?;
    Ok(())
}

async fn copy_items(dst: &Connection, src: &Connection, bill_id: &str) -> StoreResult<()> {
    let mut rows = src
        .query(
            "SELECT id, position, details, amount_minor
               FROM bill_items WHERE bill_id = ?1 ORDER BY position ASC",
            [bill_id],
        )
        .await?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().await? {
        items.push((
            text_at(&row, 0),
            integer_at(&row, 1),
            text_at(&row, 2),
            integer_at(&row, 3),
        ));
    }
    drop(rows);

    for (item_id, position, details, amount_minor) in items {
        dst.execute(
            "INSERT INTO bill_items (id, bill_id, position, details, amount_minor)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (
                item_id.as_str(),
                bill_id,
                position,
                details.as_str(),
                amount_minor,
            ),
        )
        .await?;
    }
    Ok(())
}

async fn copy_wallets(dst: &Connection, src: &Connection, bill_id: &str) -> StoreResult<()> {
    let mut rows = src
        .query(
            "SELECT kind, position, number
               FROM bill_wallets WHERE bill_id = ?1 ORDER BY kind, position",
            [bill_id],
        )
        .await?;
    let mut wallets = Vec::new();
    while let Some(row) = rows.next().await? {
        wallets.push((text_at(&row, 0), integer_at(&row, 1), text_at(&row, 2)));
    }
    drop(rows);

    for (kind, position, number) in wallets {
        dst.execute(
            "INSERT INTO bill_wallets (bill_id, kind, position, number)
             VALUES (?1, ?2, ?3, ?4)",
            (bill_id, kind.as_str(), position, number.as_str()),
        )
        .await?;
    }
    Ok(())
}

/// Make sure the destination's invoice counter is at least the source's, so a
/// number that has already been issued can never be issued again there
/// (FR-019, SC-021).
async fn advance_invoice_counter(dst: &Connection, src: &Connection) -> StoreResult<()> {
    async fn read(conn: &Connection) -> StoreResult<Option<i64>> {
        let mut rows = conn
            .query(
                "SELECT CAST(value AS INTEGER) FROM app_meta WHERE key = 'next_invoice_no'",
                (),
            )
            .await?;
        Ok(rows.next().await?.map(|row| integer_at(&row, 0)))
    }

    let Some(source_next) = read(src).await? else {
        return Ok(());
    };

    let merged = read(dst).await?.unwrap_or(1).max(source_next);
    dst.execute(
        "INSERT INTO app_meta (key, value) VALUES ('next_invoice_no', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        [merged.to_string()],
    )
    .await?;
    crate::log_debug!("carry::advance_invoice_counter: next_invoice_no is now {merged}");

    Ok(())
}

/// Copy one statement and its attachment inside the caller's transaction.
async fn copy_statement(dst: &Connection, src: &Connection, id: &str) -> StoreResult<()> {
    let mut rows = src
        .query(
            "SELECT occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at
               FROM statements WHERE id = ?1",
            [id],
        )
        .await?;
    let Some(row) = rows.next().await? else {
        return Err(StoreError::UnknownStatement);
    };
    let (occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at) = (
        text_at(&row, 0),
        text_at(&row, 1),
        text_at(&row, 2),
        integer_at(&row, 3),
        optional_text_at(&row, 4),
        text_at(&row, 5),
        text_at(&row, 6),
    );
    drop(rows);

    dst.execute(
        "INSERT INTO statements
             (id, occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        (
            id,
            occurred_on.as_str(),
            kind.as_str(),
            nature.as_str(),
            amount_minor,
            remarks.as_deref(),
            created_at.as_str(),
            updated_at.as_str(),
        ),
    )
    .await?;

    // The attachment is copied as a **reference only**: the bytes already live in
    // the object store and the local cache, which are not tied to the store file,
    // so the destination needs only the same `object_key` (v8).
    if let Some(reference) = attachments::reference_opt(src, id).await? {
        attachments::insert_within(dst, id, &reference).await?;
    }

    Ok(())
}

/// How many statements a store file holds. Paired with `remaining`, this lets an
/// interrupted carry-across report honestly how far it actually got.
pub async fn statement_count(source_path: &Path) -> StoreResult<u64> {
    crate::log_debug!("carry::statement_count: {}", source_path.display());
    let (_db, src) = open_source_read_only(source_path).await?;
    let count = super::count(&src, "statements").await? as u64;
    crate::log_debug!("carry::statement_count: {count} statement(s)");
    Ok(count)
}

/// Number of statements a destination is still missing from a source. Used to
/// report how much is left after an interrupted run.
pub async fn remaining(dst: &Connection, source_path: &Path) -> StoreResult<u64> {
    let (_db, src) = open_source_read_only(source_path).await?;
    let ids = statement_ids(&src).await?;

    let mut remaining = 0u64;
    for id in ids {
        let present = dst
            .query("SELECT 1 FROM statements WHERE id = ?1", [id.as_str()])
            .await?
            .next()
            .await?
            .is_some();
        if !present {
            remaining += 1;
        }
    }
    crate::log_debug!("carry::remaining: {remaining} statement(s) still to carry");
    Ok(remaining)
}
