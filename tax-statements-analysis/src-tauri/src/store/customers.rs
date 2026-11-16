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
use turso::{params::Params, Connection, Value};

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
/// named them are written together. The name is matched case-insensitively, which
/// is what makes "Acme" and "acme" the same customer (FR-068).
///
/// It deliberately **does not** use `INSERT … ON CONFLICT(name)`: in this engine
/// build that by-name conflict lookup mis-reads some existing rows and fails with
/// "Payload too small for indicated header size" (client bug report). Instead it
/// finds the row with the same ordered **scan** the list already uses — which
/// reads every row correctly — and then updates it by its internal row id, or
/// inserts a new one. The observable behaviour is the same.
pub async fn upsert_within(conn: &Connection, customer: &Customer) -> StoreResult<()> {
    crate::log_debug!("customers::upsert_within: '{}'", customer.name);
    let now = schema::now_iso();
    let rowid = existing_rowid(conn, customer.name.trim()).await?;

    match rowid {
        Some(rowid) => {
            conn.execute(
                "UPDATE customers
                    SET address = ?2, contact_person = ?3, contact_number = ?4,
                        email = ?5, ntn = ?6, password = ?7, updated_at = ?8
                  WHERE rowid = ?1",
                Params::Positional(vec![
                    Value::Integer(rowid),
                    optional_value(customer.address.clone()),
                    optional_value(customer.contact_person.clone()),
                    optional_value(customer.contact_number.clone()),
                    optional_value(customer.email.clone()),
                    optional_value(customer.ntn.clone()),
                    optional_value(customer.password.clone()),
                    Value::Text(now),
                ]),
            )
            .await?;
        }
        None => {
            conn.execute(
                "INSERT INTO customers
                     (name, address, contact_person, contact_number, email, ntn, password,
                      created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                Params::Positional(vec![
                    Value::Text(customer.name.trim().to_string()),
                    optional_value(customer.address.clone()),
                    optional_value(customer.contact_person.clone()),
                    optional_value(customer.contact_number.clone()),
                    optional_value(customer.email.clone()),
                    optional_value(customer.ntn.clone()),
                    optional_value(customer.password.clone()),
                    Value::Text(now),
                ]),
            )
            .await?;
        }
    }
    Ok(())
}

fn optional_value(value: Option<String>) -> Value {
    match value {
        Some(text) => Value::Text(text),
        None => Value::Null,
    }
}

/// The internal row id of the customer with this name, found with the same plain
/// scan `list` uses, so it never touches the by-name index lookup that fails on
/// some rows in this engine build. `None` when no customer has the name.
async fn existing_rowid(conn: &Connection, name: &str) -> StoreResult<Option<i64>> {
    let mut rows = conn.query("SELECT rowid, name FROM customers", ()).await?;
    while let Some(row) = rows.next().await? {
        let rowid = match row.get_value(0) {
            Ok(Value::Integer(number)) => number,
            _ => continue,
        };
        if let Ok(Value::Text(candidate)) = row.get_value(1) {
            if candidate.eq_ignore_ascii_case(name) {
                return Ok(Some(rowid));
            }
        }
    }
    Ok(None)
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
///
/// Like [`upsert_within`], it uses a plain scan rather than a by-name lookup, so
/// it reads the same rows the list does and is not tripped by the same engine
/// quirk.
pub async fn get(conn: &Connection, name: &str) -> StoreResult<Customer> {
    crate::log_debug!("customers::get: {name}");
    let wanted = name.trim();
    let mut rows = conn
        .query(&format!("SELECT {CUSTOMER_COLUMNS} FROM customers"), ())
        .await?;

    while let Some(row) = rows.next().await? {
        let candidate = row_to_customer(&row);
        if candidate.name.eq_ignore_ascii_case(wanted) {
            return Ok(candidate);
        }
    }

    Ok(Customer {
        name: name.to_string(),
        address: None,
        contact_person: None,
        contact_number: None,
        email: None,
        ntn: None,
        password: None,
    })
}
