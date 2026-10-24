// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Customers the practitioner has billed, remembered so their details can be
//! reused on later bills (FR-066–FR-069).
//!
//! A customer is identified by name, matched case-insensitively
//! (`specs/003-bills-invoice/data-model.md` §6). Nothing here ever deletes a
//! customer: one stays offered even after all of their bills are gone (FR-069).
//! Converted to the async Turso engine (research R3); behaviour unchanged.

use super::{schema, StoreResult};
use serde::{Deserialize, Serialize};
use turso::{Connection, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub name: String,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub contact_number: Option<String>,
    pub email: Option<String>,
    pub ntn: Option<String>,
    pub password: Option<String>,
}

fn optional_text_at(row: &turso::Row, index: usize) -> Option<String> {
    match row.get_value(index) {
        Ok(Value::Text(text)) => Some(text),
        _ => None,
    }
}

fn row_to_customer(row: &turso::Row) -> Customer {
    Customer {
        name: optional_text_at(row, 0).unwrap_or_default(),
        address: optional_text_at(row, 1),
        contact_person: optional_text_at(row, 2),
        contact_number: optional_text_at(row, 3),
        email: optional_text_at(row, 4),
        ntn: optional_text_at(row, 5),
        password: optional_text_at(row, 6),
    }
}

const CUSTOMER_COLUMNS: &str = "name, address, contact_person, contact_number, email, ntn, password";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Remember a customer, or bring an existing one's details up to date.
///
/// Called inside the bill's own transaction, so the customer and the bill that
/// named them are written together. The conflict target is the name, matched
/// with the table's `NOCASE` collation, which is what makes "Acme" and "acme"
/// the same customer (FR-068).
pub async fn upsert_within(conn: &Connection, customer: &Customer) -> StoreResult<()> {
    crate::log_debug!("customers::upsert_within: '{}'", customer.name);
    let now = schema::now_iso();
    conn.execute(
        "INSERT INTO customers
             (name, address, contact_person, contact_number, email, ntn, password,
              created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(name) DO UPDATE SET
             address        = excluded.address,
             contact_person = excluded.contact_person,
             contact_number = excluded.contact_number,
             email          = excluded.email,
             ntn            = excluded.ntn,
             password       = excluded.password,
             updated_at     = excluded.updated_at",
        (
            customer.name.as_str(),
            customer.address.as_deref(),
            customer.contact_person.as_deref(),
            customer.contact_number.as_deref(),
            customer.email.as_deref(),
            customer.ntn.as_deref(),
            customer.password.as_deref(),
            now.as_str(),
        ),
    )
    .await?;
    Ok(())
}

/// Every remembered customer, for the View Bills Customer filter (FR-065).
pub async fn list(conn: &Connection) -> StoreResult<Vec<Customer>> {
    let mut rows = conn
        .query(
            &format!("SELECT {CUSTOMER_COLUMNS} FROM customers ORDER BY name COLLATE NOCASE ASC"),
            (),
        )
        .await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(row_to_customer(&row));
    }
    crate::log_info!("customers::list: {} customer(s) returned", out.len());
    Ok(out)
}

/// One customer's details by name. Returns a name-only customer when the row is
/// missing, which cannot happen while the bill's foreign key holds.
pub async fn get(conn: &Connection, name: &str) -> StoreResult<Customer> {
    crate::log_debug!("customers::get: {name}");
    let mut rows = conn
        .query(
            &format!("SELECT {CUSTOMER_COLUMNS} FROM customers WHERE name = ?1"),
            [name],
        )
        .await?;

    Ok(match rows.next().await? {
        Some(row) => row_to_customer(&row),
        None => Customer {
            name: name.to_string(),
            address: None,
            contact_person: None,
            contact_number: None,
            email: None,
            ntn: None,
            password: None,
        },
    })
}
