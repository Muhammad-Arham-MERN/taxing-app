// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Customers the practitioner has billed, remembered so their details can be
//! reused on later bills (FR-066–FR-069).
//!
//! A customer is identified by name, matched case-insensitively
//! (`specs/003-bills-invoice/data-model.md` §6). Nothing here ever deletes a
//! customer: one stays offered even after all of their bills are gone (FR-069).

use super::{schema, StoreResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

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

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Remember a customer, or bring an existing one's details up to date.
///
/// Called inside the bill's own transaction, so the customer and the bill that
/// named them are written together. The conflict target is the name, matched
/// with the table's `NOCASE` collation, which is what makes "Acme" and "acme"
/// the same customer (FR-068).
pub fn upsert_within(conn: &Connection, customer: &Customer) -> StoreResult<()> {
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
        params![
            customer.name,
            customer.address,
            customer.contact_person,
            customer.contact_number,
            customer.email,
            customer.ntn,
            customer.password,
            now,
        ],
    )?;
    Ok(())
}

/// Every remembered customer, for the View Bills Customer filter (FR-065).
pub fn list(conn: &Connection) -> StoreResult<Vec<Customer>> {
    let mut stmt = conn.prepare(
        "SELECT name, address, contact_person, contact_number, email, ntn, password
           FROM customers
          ORDER BY name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Customer {
            name: row.get(0)?,
            address: row.get(1)?,
            contact_person: row.get(2)?,
            contact_number: row.get(3)?,
            email: row.get(4)?,
            ntn: row.get(5)?,
            password: row.get(6)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// One customer's details by name. Returns a name-only customer when the row is
/// missing, which cannot happen while the bill's foreign key holds.
pub fn get(conn: &Connection, name: &str) -> StoreResult<Customer> {
    let found = conn
        .query_row(
            "SELECT name, address, contact_person, contact_number, email, ntn, password
               FROM customers
              WHERE name = ?1",
            params![name],
            |row| {
                Ok(Customer {
                    name: row.get(0)?,
                    address: row.get(1)?,
                    contact_person: row.get(2)?,
                    contact_number: row.get(3)?,
                    email: row.get(4)?,
                    ntn: row.get(5)?,
                    password: row.get(6)?,
                })
            },
        )
        .optional()?;

    Ok(found.unwrap_or(Customer {
        name: name.to_string(),
        address: None,
        contact_person: None,
        contact_number: None,
        email: None,
        ntn: None,
        password: None,
    }))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
