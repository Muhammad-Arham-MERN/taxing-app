// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The attachment records' table: one file per statement, held as an **object
//! reference**.
//!
//! From version 8 the `attachments` row carries no bytes — only `file_name`,
//! `byte_size`, `content_type` and an `object_key` pointing at the object in
//! Oracle Object Storage. The bytes live in the object store and, offline, in
//! the local-only cache (`store::object_cache`). Keeping the synced copy free of
//! bytes is what stops every file from travelling to the cloud inside the store.

use super::{StoreError, StoreResult};
use crate::files::AttachmentRef;
use turso::{params::Params, Connection, Value};

/// The columns every attachment read shares.
const COLUMNS: &str = "file_name, byte_size, content_type, object_key";

fn row_to_ref(row: &turso::Row) -> AttachmentRef {
    AttachmentRef {
        file_name: match row.get_value(0) {
            Ok(Value::Text(text)) => text,
            _ => String::new(),
        },
        byte_size: match row.get_value(1) {
            Ok(Value::Integer(number)) => number,
            _ => 0,
        },
        content_type: match row.get_value(2) {
            Ok(Value::Text(text)) => Some(text),
            _ => None,
        },
        object_key: match row.get_value(3) {
            Ok(Value::Text(text)) => text,
            _ => String::new(),
        },
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record a statement's file reference, inside the caller's transaction so a
/// failure takes the statement with it. Replacing an existing file keeps the same
/// row (and therefore the same statement id).
pub async fn insert_within(
    conn: &Connection,
    statement_id: &str,
    reference: &AttachmentRef,
) -> StoreResult<()> {
    crate::log_debug!(
        "attachments::insert_within: storing '{}' ({} bytes, {}) for {statement_id}",
        reference.file_name,
        reference.byte_size,
        reference.object_key
    );
    conn.execute(
        "INSERT INTO attachments (statement_id, file_name, byte_size, content_type, object_key)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(statement_id) DO UPDATE SET
             file_name    = excluded.file_name,
             byte_size    = excluded.byte_size,
             content_type = excluded.content_type,
             object_key   = excluded.object_key",
        Params::Positional(vec![
            Value::Text(statement_id.to_string()),
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

/// Remove a statement's file reference. Deleting a statement itself removes the
/// row by cascade; this is only for an explicit detach.
pub async fn remove_within(conn: &Connection, statement_id: &str) -> StoreResult<()> {
    crate::log_debug!("attachments::remove_within: {statement_id}");
    conn.execute("DELETE FROM attachments WHERE statement_id = ?1", [statement_id])
        .await?;
    Ok(())
}

/// One statement's file reference, or an error when it holds none. This is what
/// the open/save commands read; the bytes are then fetched through `files`.
pub async fn reference(conn: &Connection, statement_id: &str) -> StoreResult<AttachmentRef> {
    match reference_opt(conn, statement_id).await? {
        Some(reference) => Ok(reference),
        None => Err(StoreError::NoAttachment),
    }
}

/// One statement's file reference when it has one, `None` otherwise.
pub async fn reference_opt(
    conn: &Connection,
    statement_id: &str,
) -> StoreResult<Option<AttachmentRef>> {
    crate::log_debug!("attachments::reference: {statement_id}");
    let sql = format!("SELECT {COLUMNS} FROM attachments WHERE statement_id = ?1");
    let mut rows = conn.query(&sql, [statement_id]).await?;
    Ok(rows.next().await?.map(|row| row_to_ref(&row)))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
