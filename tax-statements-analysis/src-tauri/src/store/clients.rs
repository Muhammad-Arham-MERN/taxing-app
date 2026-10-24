// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Clients: the contact book, keyed by **CNIC** (client request).
//!
//! A client's contacts live in their own table so that two different emails — or
//! two different numbers — given for the same CNIC, here or on another machine,
//! both survive: they are separate rows, and an identical value collapses onto the
//! primary key. That is the whole merge: it falls out of the table's key rather
//! than needing any reconciliation code (`specs/003-bills-invoice` and this
//! module's plan).

use super::{schema, StoreError, StoreResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use turso::{params::Params, Connection, Value};

/// One client and every contact value recorded for them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    /// The CNIC (or other identity) — the client's identity, matched
    /// case-insensitively.
    pub cnic: String,
    pub name: String,
    pub company: Option<String>,
    /// The client's own password, kept as plain text like a customer's, and
    /// carried onto a bill raised for them (client request).
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub phones: Vec<String>,
    #[serde(default)]
    pub whatsapps: Vec<String>,
    #[serde(default)]
    pub emails: Vec<String>,
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

fn optional_value(value: Option<String>) -> Value {
    match value {
        Some(text) if !text.trim().is_empty() => Value::Text(text),
        _ => Value::Null,
    }
}

/// The contact values for a client, grouped by their `kind`, so the two write
/// paths share one loop.
fn contact_lists(client: &Client) -> [(&'static str, &Vec<String>); 3] {
    [
        ("phone", &client.phones),
        ("whatsapp", &client.whatsapps),
        ("email", &client.emails),
    ]
}

/// Insert a client's contact values, letting an identical value collapse onto the
/// primary key (`ON CONFLICT DO NOTHING`).
async fn insert_contacts(conn: &Connection, cnic: &str, client: &Client) -> StoreResult<()> {
    for (kind, values) in contact_lists(client) {
        for value in values {
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            conn.execute(
                "INSERT INTO client_contacts (cnic, kind, value) VALUES (?1, ?2, ?3)
                 ON CONFLICT(cnic, kind, value) DO NOTHING",
                Params::Positional(vec![
                    Value::Text(cnic.to_string()),
                    Value::Text(kind.to_string()),
                    Value::Text(value.to_string()),
                ]),
            )
            .await?;
        }
    }
    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record a client, merging into the one already held under that CNIC.
///
/// The **name stays as first written**; a null company is filled in; and every
/// contact value is added, so a second email joins the list rather than replacing
/// it. Called inside the caller's transaction so a partial client is never left
/// behind.
pub async fn upsert_within(conn: &Connection, client: &Client) -> StoreResult<()> {
    let cnic = client.cnic.trim().to_string();
    crate::log_debug!("clients::upsert_within: '{cnic}' ('{}')", client.name);
    let now = schema::now_iso();

    conn.execute(
        "INSERT INTO clients (cnic, name, company, password, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(cnic) DO UPDATE SET
             company    = COALESCE(clients.company, excluded.company),
             password   = COALESCE(clients.password, excluded.password),
             updated_at = excluded.updated_at",
        Params::Positional(vec![
            Value::Text(cnic.clone()),
            Value::Text(client.name.trim().to_string()),
            optional_value(client.company.clone()),
            optional_value(client.password.clone()),
            Value::Text(now),
        ]),
    )
    .await?;

    insert_contacts(conn, &cnic, client).await?;

    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Replace a client's own details in place — the edit behind the client block.
///
/// Unlike `upsert_within` (a *merge* that unions contacts and keeps the first
/// name), this is an explicit correction: the name, company, password and
/// category are overwritten and the contact rows are **replaced**, so a number
/// the practitioner removed actually disappears. The CNIC — the client's
/// identity — is unchanged.
pub async fn update_within(conn: &Connection, client: &Client) -> StoreResult<()> {
    let cnic = client.cnic.trim().to_string();
    crate::log_debug!("clients::update_within: '{cnic}' ('{}')", client.name);
    let now = schema::now_iso();

    let changed = conn
        .execute(
            "UPDATE clients
                SET name = ?2, company = ?3, password = ?4, updated_at = ?5
              WHERE cnic = ?1",
            Params::Positional(vec![
                Value::Text(cnic.clone()),
                Value::Text(client.name.trim().to_string()),
                optional_value(client.company.clone()),
                optional_value(client.password.clone()),
                Value::Text(now),
            ]),
        )
        .await?;
    if changed == 0 {
        crate::log_warn!("clients::update_within: no client with cnic {cnic}");
        return Err(StoreError::UnknownClient);
    }

    conn.execute("DELETE FROM client_contacts WHERE cnic = ?1", [cnic.as_str()])
        .await?;
    insert_contacts(conn, &cnic, client).await?;

    Ok(())
}

/// Every client with their contacts, by name.
pub async fn list(conn: &Connection) -> StoreResult<Vec<Client>> {
    let mut clients: Vec<Client> = Vec::new();
    let mut by_key: BTreeMap<String, usize> = BTreeMap::new();

    let mut rows = conn
        .query(
            "SELECT cnic, name, company, password
               FROM clients ORDER BY name COLLATE NOCASE ASC",
            (),
        )
        .await?;
    while let Some(row) = rows.next().await? {
        let cnic = text_at(&row, 0);
        by_key.insert(cnic.to_lowercase(), clients.len());
        clients.push(Client {
            cnic,
            name: text_at(&row, 1),
            company: optional_text_at(&row, 2),
            password: optional_text_at(&row, 3),
            phones: Vec::new(),
            whatsapps: Vec::new(),
            emails: Vec::new(),
        });
    }
    drop(rows);

    let mut rows = conn
        .query(
            "SELECT cnic, kind, value FROM client_contacts ORDER BY kind ASC, value ASC",
            (),
        )
        .await?;
    while let Some(row) = rows.next().await? {
        let cnic = text_at(&row, 0);
        let kind = text_at(&row, 1);
        let value = text_at(&row, 2);
        let Some(&index) = by_key.get(&cnic.to_lowercase()) else {
            continue;
        };
        match kind.as_str() {
            "phone" => clients[index].phones.push(value),
            "whatsapp" => clients[index].whatsapps.push(value),
            "email" => clients[index].emails.push(value),
            _ => {}
        }
    }

    crate::log_info!("clients::list: {} client(s) returned", clients.len());
    Ok(clients)
}

/// One client with their contacts (used to read a client back after a write).
pub async fn get(conn: &Connection, cnic: &str) -> StoreResult<Client> {
    let mut rows = conn
        .query(
            "SELECT cnic, name, company, password FROM clients WHERE cnic = ?1",
            [cnic],
        )
        .await?;

    let mut client = match rows.next().await? {
        Some(row) => Client {
            cnic: text_at(&row, 0),
            name: text_at(&row, 1),
            company: optional_text_at(&row, 2),
            password: optional_text_at(&row, 3),
            phones: Vec::new(),
            whatsapps: Vec::new(),
            emails: Vec::new(),
        },
        None => Client {
            cnic: cnic.to_string(),
            name: String::new(),
            company: None,
            password: None,
            phones: Vec::new(),
            whatsapps: Vec::new(),
            emails: Vec::new(),
        },
    };
    drop(rows);

    let mut rows = conn
        .query(
            "SELECT kind, value FROM client_contacts WHERE cnic = ?1 ORDER BY kind ASC, value ASC",
            [cnic],
        )
        .await?;
    while let Some(row) = rows.next().await? {
        let kind = text_at(&row, 0);
        let value = text_at(&row, 1);
        match kind.as_str() {
            "phone" => client.phones.push(value),
            "whatsapp" => client.whatsapps.push(value),
            "email" => client.emails.push(value),
            _ => {}
        }
    }
    Ok(client)
}

/// Remove a client and every contact value recorded for them.
pub async fn delete(conn: &Connection, cnic: &str) -> StoreResult<()> {
    crate::log_info!("clients::delete: {cnic}");
    conn.execute("DELETE FROM client_contacts WHERE cnic = ?1", [cnic])
        .await?;
    conn.execute("DELETE FROM clients WHERE cnic = ?1", [cnic])
        .await?;
    Ok(())
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
