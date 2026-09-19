// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Customer bills: composing, listing, reading, correcting and deleting them.
//!
//! Two rules shape this module. **Invoice numbers are unique and never reused**,
//! so they come from a monotonic counter read and bumped inside the create
//! transaction. And **a bill's total is never stored** — it is summed from the
//! line items every time, so it can never disagree with them
//! (`specs/003-bills-invoice/data-model.md` §4, §5).

use super::customers::{self, Customer};
use super::statements::{from_minor, to_minor};
use super::{schema, StoreError, StoreResult};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillItem {
    pub id: String,
    pub position: i64,
    pub details: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bill {
    pub id: String,
    pub invoice_no: String,
    pub date: String,
    pub customer: Customer,
    pub jazzcash_numbers: Vec<String>,
    pub easypaisa_numbers: Vec<String>,
    pub account_holder: String,
    pub items: Vec<BillItem>,
    pub total: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBillItem {
    pub details: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBill {
    pub date: String,
    pub customer: Customer,
    #[serde(default)]
    pub jazzcash_numbers: Vec<String>,
    #[serde(default)]
    pub easypaisa_numbers: Vec<String>,
    pub account_holder: String,
    pub items: Vec<NewBillItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillUpdate {
    pub id: String,
    pub date: String,
    pub customer: Customer,
    #[serde(default)]
    pub jazzcash_numbers: Vec<String>,
    #[serde(default)]
    pub easypaisa_numbers: Vec<String>,
    pub account_holder: String,
    pub items: Vec<NewBillItem>,
}

/// A View Bills row — already carrying what the table shows, so the list never
/// loads individual line-item rows (FR-064, research R7).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillSummary {
    pub id: String,
    pub invoice_no: String,
    pub date: String,
    pub customer_name: String,
    pub details: String,
    pub total: f64,
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Take the next invoice number and advance the counter, **inside the caller's
/// transaction**.
///
/// The counter only ever moves forward: it is never decremented, so a number
/// belonging to a deleted bill is never handed to another one (FR-019, SC-021).
fn allocate_invoice_no(conn: &Connection) -> StoreResult<(String, i64)> {
    let next: i64 = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM app_meta WHERE key = 'next_invoice_no'",
            [],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(1)
        .max(1);

    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('next_invoice_no', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        params![(next + 1).to_string()],
    )?;

    Ok((format!("INV-{next:04}"), next))
}

/// Insert a bill's line items, numbering them `1..n` from the order given, so
/// the item numbers are always contiguous and gap-free (FR-014).
fn insert_items(conn: &Connection, bill_id: &str, items: &[NewBillItem]) -> StoreResult<()> {
    for (index, item) in items.iter().enumerate() {
        conn.execute(
            "INSERT INTO bill_items (id, bill_id, position, details, amount_minor)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                bill_id,
                (index as i64) + 1,
                item.details,
                to_minor(item.amount),
            ],
        )?;
    }
    Ok(())
}

/// Insert a bill's wallet numbers of one kind, in the order given. Blank rows are
/// skipped, so an unused row on the form stores nothing (client change, 2026-09-19).
fn insert_wallets(
    conn: &Connection,
    bill_id: &str,
    kind: &str,
    numbers: &[String],
) -> StoreResult<()> {
    for (index, number) in numbers.iter().enumerate() {
        if number.trim().is_empty() {
            continue;
        }
        conn.execute(
            "INSERT INTO bill_wallets (bill_id, kind, position, number)
             VALUES (?1, ?2, ?3, ?4)",
            params![bill_id, kind, (index as i64) + 1, number.trim()],
        )?;
    }
    Ok(())
}

/// The wallet numbers of one kind, in the order they were entered.
fn load_wallets(conn: &Connection, bill_id: &str, kind: &str) -> StoreResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT number FROM bill_wallets
          WHERE bill_id = ?1 AND kind = ?2
          ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![bill_id, kind], |row| row.get::<_, String>(0))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn load_items(conn: &Connection, bill_id: &str) -> StoreResult<Vec<BillItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, position, details, amount_minor
           FROM bill_items
          WHERE bill_id = ?1
          ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![bill_id], |row| {
        let minor: i64 = row.get(3)?;
        Ok(BillItem {
            id: row.get(0)?,
            position: row.get(1)?,
            details: row.get(2)?,
            amount: from_minor(minor),
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn total_of(items: &[BillItem]) -> f64 {
    let minor: i64 = items.iter().map(|item| to_minor(item.amount)).sum();
    from_minor(minor)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record a bill: allocate its invoice number, remember its customer, write the
/// bill and its items — all in one transaction, so an interruption leaves either
/// the whole bill or none of it (FR-022).
pub fn create(conn: &mut Connection, input: &NewBill) -> StoreResult<Bill> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = schema::now_iso();

    let tx = conn.transaction()?;
    let (invoice_no, invoice_seq) = allocate_invoice_no(&tx)?;

    customers::upsert_within(&tx, &input.customer)?;
    tx.execute(
        "INSERT INTO bills
             (id, invoice_no, invoice_seq, occurred_on, customer_name,
              account_holder, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            id,
            invoice_no,
            invoice_seq,
            input.date,
            input.customer.name,
            input.account_holder,
            now,
        ],
    )?;

    insert_items(&tx, &id, &input.items)?;
    insert_wallets(&tx, &id, "jazzcash", &input.jazzcash_numbers)?;
    insert_wallets(&tx, &id, "easypaisa", &input.easypaisa_numbers)?;
    tx.commit()?;

    get(conn, &id)
}

/// One stored bill with its customer and its line items (FR-044).
pub fn get(conn: &Connection, id: &str) -> StoreResult<Bill> {
    let row = conn
        .query_row(
            "SELECT id, invoice_no, occurred_on, customer_name, account_holder, created_at
               FROM bills
              WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()?
        .ok_or(StoreError::UnknownBill)?;

    let customer = customers::get(conn, &row.3)?;
    let items = load_items(conn, id)?;
    let total = total_of(&items);

    Ok(Bill {
        id: row.0,
        invoice_no: row.1,
        date: row.2,
        customer,
        jazzcash_numbers: load_wallets(conn, id, "jazzcash")?,
        easypaisa_numbers: load_wallets(conn, id, "easypaisa")?,
        account_holder: row.4,
        items,
        total,
        created_at: row.5,
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The View Bills list: every bill matching the optional date range and optional
/// customer, newest first.
///
/// `details` and `total` are computed in SQL (`GROUP_CONCAT`/`SUM`) so the list
/// carries exactly what the table shows and never loads line-item rows — which
/// keeps it fast over thousands of bills (FR-039–FR-041, FR-064, SC-011).
pub fn list(
    conn: &Connection,
    from: Option<&str>,
    to: Option<&str>,
    customer: Option<&str>,
) -> StoreResult<Vec<BillSummary>> {
    if let (Some(from), Some(to)) = (from, to) {
        if from > to {
            return Err(StoreError::InvalidRange);
        }
    }

    let mut clauses: Vec<&str> = Vec::new();
    let mut values: Vec<String> = Vec::new();

    if let Some(from) = from {
        clauses.push("b.occurred_on >= ?");
        values.push(from.to_string());
    }
    if let Some(to) = to {
        clauses.push("b.occurred_on <= ?");
        values.push(to.to_string());
    }
    if let Some(customer) = customer {
        clauses.push("b.customer_name = ?");
        values.push(customer.to_string());
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };

    let sql = format!(
        "SELECT b.id, b.invoice_no, b.occurred_on, b.customer_name,
                COALESCE(GROUP_CONCAT(i.details, '; '), '') AS details,
                COALESCE(SUM(i.amount_minor), 0) AS total_minor
           FROM bills b
           LEFT JOIN bill_items i ON i.bill_id = b.id
          {where_sql}
          GROUP BY b.id
          ORDER BY b.occurred_on DESC, b.created_at DESC"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values.iter().map(|value| value.as_str())), |row| {
        let minor: i64 = row.get(5)?;
        Ok(BillSummary {
            id: row.get(0)?,
            invoice_no: row.get(1)?,
            date: row.get(2)?,
            customer_name: row.get(3)?,
            details: row.get(4)?,
            total: from_minor(minor),
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Correct a stored bill **in place**: same identity, same invoice number, and
/// the line items replaced wholesale so they are renumbered `1..n` with no gaps
/// (FR-048, FR-015).
pub fn update(conn: &mut Connection, update: &BillUpdate) -> StoreResult<Bill> {
    let now = schema::now_iso();

    let tx = conn.transaction()?;

    // The customer is upserted before the bill references them, so the foreign
    // key always holds even when the practitioner renamed the customer.
    customers::upsert_within(&tx, &update.customer)?;

    let changed = tx.execute(
        "UPDATE bills
            SET occurred_on = ?2, customer_name = ?3, account_holder = ?4, updated_at = ?5
          WHERE id = ?1",
        params![
            update.id,
            update.date,
            update.customer.name,
            update.account_holder,
            now,
        ],
    )?;
    if changed == 0 {
        return Err(StoreError::UnknownBill);
    }

    tx.execute(
        "DELETE FROM bill_items WHERE bill_id = ?1",
        params![update.id],
    )?;
    insert_items(&tx, &update.id, &update.items)?;

    tx.execute(
        "DELETE FROM bill_wallets WHERE bill_id = ?1",
        params![update.id],
    )?;
    insert_wallets(&tx, &update.id, "jazzcash", &update.jazzcash_numbers)?;
    insert_wallets(&tx, &update.id, "easypaisa", &update.easypaisa_numbers)?;

    // The invoice number and its sequence are deliberately untouched: a corrected
    // bill keeps the number it was issued with (FR-048, SC-008).
    tx.commit()?;

    get(conn, &update.id)
}

/// Delete a bill. Its line items go with it through the schema's cascade; the
/// invoice number is **not** freed (FR-053, FR-054, FR-019).
pub fn delete(conn: &Connection, id: &str) -> StoreResult<()> {
    let changed = conn.execute("DELETE FROM bills WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(StoreError::UnknownBill);
    }
    Ok(())
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
