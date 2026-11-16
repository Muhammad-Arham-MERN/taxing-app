// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Customer bills: composing, listing, reading, correcting and deleting them.
//!
//! Two rules shape this module. **Invoice numbers are unique and never reused**,
//! so they come from a monotonic counter read and bumped inside the create
//! transaction. And **a bill's total is never stored** — it is summed from the
//! line items every time, so it can never disagree with them
//! (`specs/003-bills-invoice/data-model.md` §4, §5). Converted to the async Turso
//! engine in Module 4 (research R2, R3); the SQL and behaviour are unchanged.

use super::customers::{self, Customer};
use super::statements::{from_minor, to_minor};
use super::{schema, StoreError, StoreResult};
use serde::{Deserialize, Serialize};
use turso::{params::Params, Connection, Value};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillItem {
    pub id: String,
    pub position: i64,
    pub details: String,
    pub amount: f64,
    /// An optional value shown struck through beside the amount; never totalled.
    pub crossed: Option<f64>,
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
    /// The two banks' IBAN/account values carried on this bill's invoice footer
    /// (client request — editable, defaulted to the practice's own numbers).
    pub meezan_iban: Option<String>,
    pub js_iban: Option<String>,
    pub items: Vec<BillItem>,
    pub total: f64,
    /// The date this bill was marked paid; `None` means it is still **unpaid**
    /// (client request — the View Bills Status column).
    pub paid_on: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBillItem {
    pub details: String,
    pub amount: f64,
    /// The optional struck-through value entered beside the amount.
    #[serde(default)]
    pub crossed: Option<f64>,
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
    /// The invoice footer's two bank values; absent means "use the defaults".
    #[serde(default)]
    pub meezan_iban: Option<String>,
    #[serde(default)]
    pub js_iban: Option<String>,
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
    #[serde(default)]
    pub meezan_iban: Option<String>,
    #[serde(default)]
    pub js_iban: Option<String>,
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
    /// `None` is **Unpaid**; a date is **Paid** on that date (client request).
    pub paid_on: Option<String>,
}

fn text_at(row: &turso::Row, index: usize) -> String {
    match row.get_value(index) {
        Ok(Value::Text(text)) => text,
        _ => String::new(),
    }
}

fn integer_at(row: &turso::Row, index: usize) -> i64 {
    match row.get_value(index) {
        Ok(Value::Integer(number)) => number,
        _ => 0,
    }
}

fn optional_text_at(row: &turso::Row, index: usize) -> Option<String> {
    match row.get_value(index) {
        Ok(Value::Text(text)) => Some(text),
        _ => None,
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Take the next invoice number and advance the counter, **inside the caller's
/// transaction**.
///
/// The counter only ever moves forward: it is never decremented, so a number
/// belonging to a deleted bill is never handed to another one (FR-019, SC-021).
async fn allocate_invoice_no(conn: &Connection) -> StoreResult<(String, i64)> {
    let mut rows = conn
        .query(
            "SELECT CAST(value AS INTEGER) FROM app_meta WHERE key = 'next_invoice_no'",
            (),
        )
        .await?;
    let counter = rows
        .next()
        .await?
        .map(|row| integer_at(&row, 0))
        .unwrap_or(1)
        .max(1);
    drop(rows);

    // The `app_meta` counter is authoritative only on this machine. A store that
    // **pulled** bills from another computer, or that carried them across, can
    // hold `invoice_seq` values above the local counter; trusting the counter
    // alone would then hand out a number that is already taken and the insert
    // would fail with `UNIQUE constraint failed: bills.invoice_seq` (client bug
    // report). The highest number actually present is therefore the floor.
    let mut rows = conn
        .query("SELECT COALESCE(MAX(invoice_seq), 0) FROM bills", ())
        .await?;
    let highest = rows.next().await?.map(|row| integer_at(&row, 0)).unwrap_or(0);
    drop(rows);

    let next = counter.max(highest + 1);

    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('next_invoice_no', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        [(next + 1).to_string()],
    )
    .await?;

    crate::log_debug!("allocate_invoice_no: issuing INV-{next:04} (next counter is {})", next + 1);
    Ok((format!("INV-{next:04}"), next))
}

/// Whether the engine's failure is the invoice number already being taken, so the
/// create can allocate again rather than reporting it.
fn is_invoice_conflict(error: &turso::Error) -> bool {
    match error {
        turso::Error::Error(message) => {
            message.contains("bills.invoice_seq") || message.contains("bills.invoice_no")
        }
        _ => false,
    }
}

/// Insert a bill's line items, numbering them `1..n` from the order given, so
/// the item numbers are always contiguous and gap-free (FR-014).
async fn insert_items(
    conn: &Connection,
    bill_id: &str,
    items: &[NewBillItem],
) -> StoreResult<()> {
    for (index, item) in items.iter().enumerate() {
        conn.execute(
            "INSERT INTO bill_items (id, bill_id, position, details, amount_minor, crossed_minor)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            (
                uuid::Uuid::new_v4().to_string(),
                bill_id,
                (index as i64) + 1,
                item.details.as_str(),
                to_minor(item.amount),
                item.crossed.map(to_minor),
            ),
        )
        .await?;
    }
    Ok(())
}

/// Insert a bill's wallet numbers of one kind, in the order given. Blank rows are
/// skipped, so an unused row on the form stores nothing (client change, 2026-09-19).
async fn insert_wallets(
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
            (bill_id, kind, (index as i64) + 1, number.trim()),
        )
        .await?;
    }
    Ok(())
}

/// The wallet numbers of one kind, in the order they were entered.
async fn load_wallets(conn: &Connection, bill_id: &str, kind: &str) -> StoreResult<Vec<String>> {
    let mut rows = conn
        .query(
            "SELECT number FROM bill_wallets
              WHERE bill_id = ?1 AND kind = ?2
              ORDER BY position ASC",
            (bill_id, kind),
        )
        .await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(text_at(&row, 0));
    }
    Ok(out)
}

async fn load_items(conn: &Connection, bill_id: &str) -> StoreResult<Vec<BillItem>> {
    let mut rows = conn
        .query(
            "SELECT id, position, details, amount_minor, crossed_minor
               FROM bill_items
              WHERE bill_id = ?1
              ORDER BY position ASC",
            [bill_id],
        )
        .await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        let crossed = match row.get_value(4) {
            Ok(Value::Integer(number)) => Some(from_minor(number)),
            _ => None,
        };
        out.push(BillItem {
            id: text_at(&row, 0),
            position: integer_at(&row, 1),
            details: text_at(&row, 2),
            amount: from_minor(integer_at(&row, 3)),
            crossed,
        });
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
pub async fn create(conn: &Connection, input: &NewBill) -> StoreResult<Bill> {
    crate::log_info!(
        "bills::create: recording a bill for '{}' ({} item(s))",
        input.customer.name,
        input.items.len()
    );

    let id = uuid::Uuid::new_v4().to_string();
    let now = schema::now_iso();

    // A number that turns out to be taken is allocated **again** rather than
    // reported: the store is logically single-writer, but a number can still be
    // taken by a row that arrived through sync, so the insert is retried a few
    // times before the failure is surfaced.
    const MAX_ATTEMPTS: u32 = 3;
    let mut attempt = 1;
    loop {
        let tx = super::begin_write(conn).await?;
        let (invoice_no, invoice_seq) = allocate_invoice_no(&tx).await?;

        customers::upsert_within(&tx, &input.customer).await?;
        let inserted = tx
            .execute(
                "INSERT INTO bills
                     (id, invoice_no, invoice_seq, occurred_on, customer_name,
                      account_holder, meezan_iban, js_iban, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                (
                    id.as_str(),
                    invoice_no.as_str(),
                    invoice_seq,
                    input.date.as_str(),
                    input.customer.name.as_str(),
                    input.account_holder.as_str(),
                    input.meezan_iban.as_deref(),
                    input.js_iban.as_deref(),
                    now.as_str(),
                ),
            )
            .await;
        if let Err(error) = inserted {
            if attempt < MAX_ATTEMPTS && is_invoice_conflict(&error) {
                attempt += 1;
                crate::log_warn!("bills::create: {invoice_no} is already taken — allocating again");
                continue;
            }
            return Err(error.into());
        }

        insert_items(&tx, &id, &input.items).await?;
        insert_wallets(&tx, &id, "jazzcash", &input.jazzcash_numbers).await?;
        insert_wallets(&tx, &id, "easypaisa", &input.easypaisa_numbers).await?;

        match tx.commit().await {
            Ok(()) => {
                crate::log_info!("bills::create: committed bill {id} as {invoice_no}");
                return get(conn, &id).await;
            }
            Err(error) if attempt < MAX_ATTEMPTS && is_invoice_conflict(&error) => {
                attempt += 1;
                crate::log_warn!("bills::create: {invoice_no} is already taken — allocating again");
                continue;
            }
            Err(error) => return Err(error.into()),
        }
    }
}

/// One stored bill with its customer and its line items (FR-044).
pub async fn get(conn: &Connection, id: &str) -> StoreResult<Bill> {
    crate::log_debug!("bills::get: {id}");
    let mut rows = conn
        .query(
            "SELECT id, invoice_no, occurred_on, customer_name, account_holder,
                    meezan_iban, js_iban, paid_on, created_at
               FROM bills
              WHERE id = ?1",
            [id],
        )
        .await?;

    let Some(row) = rows.next().await? else {
        crate::log_warn!("bills::get: no bill with id {id}");
        return Err(StoreError::UnknownBill);
    };
    let bill_id = text_at(&row, 0);
    let invoice_no = text_at(&row, 1);
    let date = text_at(&row, 2);
    let customer_name = text_at(&row, 3);
    let account_holder = text_at(&row, 4);
    let meezan_iban = optional_text_at(&row, 5);
    let js_iban = optional_text_at(&row, 6);
    let paid_on = optional_text_at(&row, 7);
    let created_at = text_at(&row, 8);
    drop(rows);

    let customer = customers::get(conn, &customer_name).await?;
    let items = load_items(conn, &bill_id).await?;
    let total = total_of(&items);

    Ok(Bill {
        id: bill_id.clone(),
        invoice_no,
        date,
        customer,
        jazzcash_numbers: load_wallets(conn, &bill_id, "jazzcash").await?,
        easypaisa_numbers: load_wallets(conn, &bill_id, "easypaisa").await?,
        account_holder,
        meezan_iban,
        js_iban,
        items,
        total,
        paid_on,
        created_at,
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The View Bills list: every bill matching the optional date range and optional
/// customer, newest first.
///
/// `details` and `total` are computed in SQL (`GROUP_CONCAT`/`SUM`) so the list
/// carries exactly what the table shows and never loads line-item rows — which
/// keeps it fast over thousands of bills (FR-039–FR-041, FR-064, SC-011).
pub async fn list(
    conn: &Connection,
    from: Option<&str>,
    to: Option<&str>,
    customer: Option<&str>,
) -> StoreResult<Vec<BillSummary>> {
    crate::log_info!("bills::list: from={from:?} to={to:?} customer={customer:?}");
    if let (Some(from), Some(to)) = (from, to) {
        if from > to {
            crate::log_warn!("bills::list: the From date is after the To date");
            return Err(StoreError::InvalidRange);
        }
    }

    let mut clauses: Vec<&str> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(from) = from {
        clauses.push("b.occurred_on >= ?");
        values.push(Value::Text(from.to_string()));
    }
    if let Some(to) = to {
        clauses.push("b.occurred_on <= ?");
        values.push(Value::Text(to.to_string()));
    }
    if let Some(customer) = customer {
        clauses.push("b.customer_name = ?");
        values.push(Value::Text(customer.to_string()));
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };

    let sql = format!(
        "SELECT b.id, b.invoice_no, b.occurred_on, b.customer_name,
                COALESCE(GROUP_CONCAT(i.details, '; '), '') AS details,
                COALESCE(SUM(i.amount_minor), 0) AS total_minor,
                b.paid_on
           FROM bills b
           LEFT JOIN bill_items i ON i.bill_id = b.id
          {where_sql}
          GROUP BY b.id
          ORDER BY b.occurred_on DESC, b.created_at DESC"
    );

    let mut rows = conn
        .query(&sql, Params::Positional(values))
        .await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(BillSummary {
            id: text_at(&row, 0),
            invoice_no: text_at(&row, 1),
            date: text_at(&row, 2),
            customer_name: text_at(&row, 3),
            details: text_at(&row, 4),
            total: from_minor(integer_at(&row, 5)),
            paid_on: optional_text_at(&row, 6),
        });
    }
    crate::log_info!("bills::list: {} bill(s) returned", out.len());
    Ok(out)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Correct a stored bill **in place**: same identity, same invoice number, and
/// the line items replaced wholesale so they are renumbered `1..n` with no gaps
/// (FR-048, FR-015).
pub async fn update(conn: &Connection, update: &BillUpdate) -> StoreResult<Bill> {
    crate::log_info!(
        "bills::update: correcting bill {} for '{}' ({} item(s))",
        update.id,
        update.customer.name,
        update.items.len()
    );
    let now = schema::now_iso();

    let tx = super::begin_write(conn).await?;

    // The customer is upserted before the bill references them, so the foreign
    // key always holds even when the practitioner renamed the customer.
    customers::upsert_within(&tx, &update.customer).await?;

    // `paid_on` is deliberately **not** touched here: a correction keeps the
    // bill's payment status, which is set from View Bills (client request).
    let changed = tx
        .execute(
            "UPDATE bills
                SET occurred_on = ?2, customer_name = ?3, account_holder = ?4,
                    meezan_iban = ?5, js_iban = ?6, updated_at = ?7
              WHERE id = ?1",
            (
                update.id.as_str(),
                update.date.as_str(),
                update.customer.name.as_str(),
                update.account_holder.as_str(),
                update.meezan_iban.as_deref(),
                update.js_iban.as_deref(),
                now.as_str(),
            ),
        )
        .await?;
    if changed == 0 {
        crate::log_warn!("bills::update: no bill with id {}", update.id);
        return Err(StoreError::UnknownBill);
    }

    tx.execute("DELETE FROM bill_items WHERE bill_id = ?1", [update.id.as_str()])
        .await?;
    insert_items(&tx, &update.id, &update.items).await?;

    tx.execute("DELETE FROM bill_wallets WHERE bill_id = ?1", [update.id.as_str()])
        .await?;
    insert_wallets(&tx, &update.id, "jazzcash", &update.jazzcash_numbers).await?;
    insert_wallets(&tx, &update.id, "easypaisa", &update.easypaisa_numbers).await?;

    // The invoice number and its sequence are deliberately untouched: a corrected
    // bill keeps the number it was issued with (FR-048, SC-008).
    tx.commit().await?;
    crate::log_info!("bills::update: committed bill {}", update.id);

    get(conn, &update.id).await
}

/// Delete a bill. Its line items go with it through the schema's cascade; the
/// invoice number is **not** freed (FR-053, FR-054, FR-019).
pub async fn delete(conn: &Connection, id: &str) -> StoreResult<()> {
    crate::log_info!("bills::delete: removing bill {id}");
    let changed = conn
        .execute("DELETE FROM bills WHERE id = ?1", [id])
        .await?;
    if changed == 0 {
        crate::log_warn!("bills::delete: no bill with id {id}");
        return Err(StoreError::UnknownBill);
    }
    crate::log_info!("bills::delete: removed bill {id}");
    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Mark a bill **paid** on a date, or **unpaid** again with `None` (client
/// request — the View Bills Status column). Only this field moves; the bill's
/// identity, number, items and totals are untouched.
pub async fn set_paid(conn: &Connection, id: &str, paid_on: Option<&str>) -> StoreResult<Bill> {
    crate::log_info!("bills::set_paid: {id} -> {paid_on:?}");
    let now = schema::now_iso();
    let changed = conn
        .execute(
            "UPDATE bills SET paid_on = ?2, updated_at = ?3 WHERE id = ?1",
            (id, paid_on, now.as_str()),
        )
        .await?;
    if changed == 0 {
        crate::log_warn!("bills::set_paid: no bill with id {id}");
        return Err(StoreError::UnknownBill);
    }
    get(conn, id).await
}
