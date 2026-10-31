// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! A client's own records: the rows behind the table that opens when a client
//! block is clicked (client request).
//!
//! Each record belongs to one client, carries a name, an ISO date, free-text
//! remarks and an optional category, and may hold **one** file. As with
//! statements, the file's bytes live in a `data` BLOB on a separate table so no
//! list query ever reads them — the list carries the file's **name** only
//! (FR-029, SC-011).

use super::{schema, StoreError, StoreResult};
use crate::files::AttachmentRef;
use serde::{Deserialize, Serialize};
use turso::{params::Params, Connection, Value};

/// A stored record, shaped for the frontend seam.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: String,
    pub cnic: String,
    pub name: String,
    pub date: String,
    pub remarks: Option<String>,
    pub category_id: Option<String>,
    pub file_name: Option<String>,
    /// The file's **object key**, so a transfer in progress can be matched to
    /// this row (the bytes themselves never travel).
    pub file_ref: Option<String>,
    pub created_at: String,
}

/// A new record as entered on the form. The file's name and bytes arrive as the
/// raw request body and are turned into an `AttachmentRef` by the command layer,
/// so they are deliberately absent here.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRecord {
    pub cnic: String,
    pub name: String,
    pub date: String,
    #[serde(default)]
    pub remarks: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
}

/// What an edit does to a record's file (mirrors a statement's attachment change).
#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum RecordAttachmentAction {
    /// Leave the stored file exactly as it is.
    Keep,
    /// Detach the file.
    Remove,
    /// Swap in different contents; the bytes arrive in the raw body, are turned
    /// into an [`AttachmentRef`] by the command layer, and are spliced back in
    /// here.
    Replace {
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "contentType", default)]
        content_type: Option<String>,
        #[serde(skip)]
        reference: Option<AttachmentRef>,
    },
}

/// An edit: the record's identity plus the values that may change.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordUpdate {
    pub id: String,
    pub name: String,
    pub date: String,
    #[serde(default)]
    pub remarks: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    pub attachment: RecordAttachmentAction,
}

/// The columns every read shares. The file's bytes are never selected here — only
/// the file's name, which is all a list needs.
const RECORD_COLUMNS: &str = "r.id, r.cnic, r.name, r.occurred_on, r.remarks, \
                              r.category_id, r.created_at, f.file_name, f.object_key";

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

fn row_to_record(row: &turso::Row) -> Record {
    Record {
        id: text_at(row, 0),
        cnic: text_at(row, 1),
        name: text_at(row, 2),
        date: text_at(row, 3),
        remarks: optional_text_at(row, 4),
        category_id: optional_text_at(row, 5),
        created_at: text_at(row, 6),
        file_name: optional_text_at(row, 7),
        file_ref: optional_text_at(row, 8),
    }
}

/// Store a file's reference for a record, inside the caller's transaction.
async fn insert_file_within(
    conn: &Connection,
    record_id: &str,
    reference: &AttachmentRef,
) -> StoreResult<()> {
    crate::log_debug!(
        "client_records::insert_file_within: '{}' ({} bytes, {}) for {record_id}",
        reference.file_name,
        reference.byte_size,
        reference.object_key
    );
    conn.execute(
        "INSERT INTO client_record_files (record_id, file_name, byte_size, content_type, object_key)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(record_id) DO UPDATE SET
             file_name    = excluded.file_name,
             byte_size    = excluded.byte_size,
             content_type = excluded.content_type,
             object_key   = excluded.object_key",
        Params::Positional(vec![
            Value::Text(record_id.to_string()),
            Value::Text(reference.file_name.clone()),
            Value::Integer(reference.byte_size),
            match &reference.content_type {
                Some(text) => Value::Text(text.clone()),
                None => Value::Null,
            },
            Value::Text(reference.object_key.clone()),
        ]),
    )
    .await?;
    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Every record belonging to one client, newest first, each carrying its file's
/// **name** only.
pub async fn list(conn: &Connection, cnic: &str) -> StoreResult<Vec<Record>> {
    crate::log_info!("client_records::list: cnic '{cnic}'");
    let sql = format!(
        "SELECT {RECORD_COLUMNS}
           FROM client_records r
           LEFT JOIN client_record_files f ON f.record_id = r.id
          WHERE r.cnic = ?1
          ORDER BY r.occurred_on DESC, r.created_at DESC"
    );
    let mut rows = conn.query(&sql, [cnic]).await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(row_to_record(&row));
    }
    crate::log_info!("client_records::list: {} record(s) returned", out.len());
    Ok(out)
}

/// Record a client's entry, and its file if one was given, in one transaction.
pub async fn create(
    conn: &Connection,
    input: &NewRecord,
    attachment: Option<&AttachmentRef>,
) -> StoreResult<Record> {
    crate::log_info!(
        "client_records::create: '{}' for {} ({}){}",
        input.name,
        input.cnic,
        input.date,
        if attachment.is_some() { ", with a file" } else { "" }
    );

    let id = uuid::Uuid::new_v4().to_string();
    let now = schema::now_iso();

    let tx = conn.unchecked_transaction().await?;
    tx.execute(
        "INSERT INTO client_records
             (id, cnic, name, occurred_on, remarks, category_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        (
            id.as_str(),
            input.cnic.trim(),
            input.name.trim(),
            input.date.as_str(),
            input.remarks.as_deref(),
            input.category_id.as_deref(),
            now.as_str(),
        ),
    )
    .await?;

    if let Some(payload) = attachment {
        insert_file_within(&tx, &id, payload).await?;
    }
    tx.commit().await?;
    crate::log_info!("client_records::create: committed record {id}");

    Ok(Record {
        id,
        cnic: input.cnic.trim().to_string(),
        name: input.name.trim().to_string(),
        date: input.date.clone(),
        remarks: input.remarks.clone(),
        category_id: input.category_id.clone(),
        file_name: attachment.map(|payload| payload.file_name.clone()),
        file_ref: attachment.map(|payload| payload.object_key.clone()),
        created_at: now,
    })
}

/// Correct a stored record in place. `Keep` leaves the stored file byte-identical.
pub async fn update(conn: &Connection, update: &RecordUpdate) -> StoreResult<Record> {
    crate::log_info!("client_records::update: correcting record {}", update.id);
    let now = schema::now_iso();

    let tx = conn.unchecked_transaction().await?;
    let changed = tx
        .execute(
            "UPDATE client_records
                SET name = ?2, occurred_on = ?3, remarks = ?4, category_id = ?5, updated_at = ?6
              WHERE id = ?1",
            (
                update.id.as_str(),
                update.name.trim(),
                update.date.as_str(),
                update.remarks.as_deref(),
                update.category_id.as_deref(),
                now.as_str(),
            ),
        )
        .await?;
    if changed == 0 {
        crate::log_warn!("client_records::update: no record with id {}", update.id);
        return Err(StoreError::UnknownRecord);
    }

    match &update.attachment {
        RecordAttachmentAction::Keep => {
            crate::log_debug!("client_records::update: keeping the stored file")
        }
        RecordAttachmentAction::Remove => {
            crate::log_debug!("client_records::update: removing the stored file");
            tx.execute(
                "DELETE FROM client_record_files WHERE record_id = ?1",
                [update.id.as_str()],
            )
            .await?;
        }
        RecordAttachmentAction::Replace { reference, file_name, .. } => {
            let reference = reference.as_ref().ok_or(StoreError::FileMissing)?;
            crate::log_debug!(
                "client_records::update: replacing the file with '{file_name}' ({})",
                reference.object_key
            );
            insert_file_within(&tx, &update.id, reference).await?;
        }
    }
    tx.commit().await?;

    get(conn, &update.id).await
}

/// One record with its file name, read back after a write.
pub async fn get(conn: &Connection, id: &str) -> StoreResult<Record> {
    let sql = format!(
        "SELECT {RECORD_COLUMNS}
           FROM client_records r
           LEFT JOIN client_record_files f ON f.record_id = r.id
          WHERE r.id = ?1"
    );
    let mut rows = conn.query(&sql, [id]).await?;
    match rows.next().await? {
        Some(row) => Ok(row_to_record(&row)),
        None => Err(StoreError::UnknownRecord),
    }
}

/// Delete a record. Its file goes with it through the schema's cascade.
pub async fn delete(conn: &Connection, id: &str) -> StoreResult<()> {
    crate::log_info!("client_records::delete: {id}");
    let changed = conn
        .execute("DELETE FROM client_records WHERE id = ?1", [id])
        .await?;
    if changed == 0 {
        crate::log_warn!("client_records::delete: no record with id {id}");
        return Err(StoreError::UnknownRecord);
    }
    Ok(())
}

/// One record's file reference, or an error when it holds none. The open/save
/// commands read this and then fetch the bytes through `files`.
pub async fn reference(conn: &Connection, id: &str) -> StoreResult<AttachmentRef> {
    match reference_opt(conn, id).await? {
        Some(reference) => Ok(reference),
        None => Err(StoreError::NoAttachment),
    }
}

/// One record's file reference when it holds one, `None` otherwise.
pub async fn reference_opt(conn: &Connection, id: &str) -> StoreResult<Option<AttachmentRef>> {
    crate::log_debug!("client_records::reference: {id}");
    let mut rows = conn
        .query(
            "SELECT file_name, byte_size, content_type, object_key
               FROM client_record_files WHERE record_id = ?1",
            [id],
        )
        .await?;

    let Some(row) = rows.next().await? else {
        return Ok(None);
    };
    Ok(Some(AttachmentRef {
        file_name: text_at(&row, 0),
        byte_size: match row.get_value(1)? {
            Value::Integer(number) => number,
            _ => 0,
        },
        content_type: optional_text_at(&row, 2),
        object_key: text_at(&row, 3),
    }))
}

/// Every record file reference, for the post-pull fetch of files this machine
/// has not seen yet. Reads references only — never bytes.
pub async fn all_file_refs(conn: &Connection) -> StoreResult<Vec<AttachmentRef>> {
    let mut rows = conn
        .query(
            "SELECT file_name, byte_size, content_type, object_key FROM client_record_files",
            (),
        )
        .await?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(AttachmentRef {
            file_name: text_at(&row, 0),
            byte_size: match row.get_value(1)? {
                Value::Integer(number) => number,
                _ => 0,
            },
            content_type: optional_text_at(&row, 2),
            object_key: text_at(&row, 3),
        });
    }
    crate::log_debug!("client_records::all_file_refs: {} reference(s)", out.len());
    Ok(out)
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
