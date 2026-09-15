// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Attachment contents. These routines are the only ones that ever touch the
//! `data` column, and they always deal with exactly one statement's file.

use super::{StoreError, StoreResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// What the frontend sends when it attaches or replaces a file, and what it
/// receives back when it asks for one.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentPayload {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

/// One statement's whole file. Never a collection — there is no "read all
/// attachments" routine, by design (FR-037).
#[derive(Debug)]
pub struct AttachmentData {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

const CHUNK: usize = 256 * 1024;

/// Store a file's contents against a statement, inside the caller's transaction
/// so a failure takes the statement with it.
pub fn insert_within(
    conn: &Connection,
    statement_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> StoreResult<()> {
    conn.execute(
        "INSERT INTO attachments (statement_id, file_name, byte_size, data)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(statement_id) DO UPDATE SET
             file_name = excluded.file_name,
             byte_size = excluded.byte_size,
             data      = excluded.data",
        params![statement_id, file_name, bytes.len() as i64, bytes],
    )?;
    Ok(())
}

/// The exact stored contents of one statement's file (FR-036).
pub fn read(conn: &Connection, statement_id: &str) -> StoreResult<AttachmentData> {
    let row: Option<(String, Vec<u8>)> = conn
        .query_row(
            "SELECT file_name, data FROM attachments WHERE statement_id = ?1",
            params![statement_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    match row {
        Some((file_name, bytes)) => Ok(AttachmentData { file_name, bytes }),
        None => Err(StoreError::NoAttachment),
    }
}

pub fn file_name(conn: &Connection, statement_id: &str) -> StoreResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT file_name FROM attachments WHERE statement_id = ?1",
            params![statement_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?)
}

pub fn byte_size(conn: &Connection, statement_id: &str) -> StoreResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT byte_size FROM attachments WHERE statement_id = ?1",
            params![statement_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Copy one attachment from another store, chunk by chunk, so peak memory is a
/// single buffer rather than the whole file (research R5).
///
/// The size cannot be changed through the blob API, so the destination row is
/// created with `ZEROBLOB` to reserve the space and then filled in place.
/// Called inside the destination's per-statement transaction, so an interruption
/// leaves either the complete attachment or none of it.
pub fn copy_from(
    dst: &Connection,
    dst_statement_id: &str,
    src: &Connection,
    src_statement_id: &str,
) -> StoreResult<()> {
    let file_name = file_name(src, src_statement_id)?.ok_or(StoreError::NoAttachment)?;
    let size = byte_size(src, src_statement_id)?.unwrap_or(0);

    dst.execute(
        "INSERT INTO attachments (statement_id, file_name, byte_size, data)
         VALUES (?1, ?2, ?3, ZEROBLOB(?3))
         ON CONFLICT(statement_id) DO UPDATE SET
             file_name = excluded.file_name,
             byte_size = excluded.byte_size,
             data      = ZEROBLOB(excluded.byte_size)",
        params![dst_statement_id, file_name, size],
    )?;

    if size == 0 {
        return Ok(());
    }

    let reader = src.blob_open(
        rusqlite::MAIN_DB,
        "attachments",
        "data",
        row_id(src, src_statement_id)?,
        true,
    )?;
    let mut writer = dst.blob_open(
        rusqlite::MAIN_DB,
        "attachments",
        "data",
        row_id(dst, dst_statement_id)?,
        false,
    )?;

    let total = reader.len();
    let mut buffer = vec![0u8; CHUNK];
    let mut offset = 0usize;
    while offset < total {
        let read = reader.read_at(&mut buffer, offset)?;
        if read == 0 {
            break;
        }
        writer.write_at(&buffer[..read], offset)?;
        offset += read;
    }

    Ok(())
}

/// `blob_open` addresses a row by rowid, which is why `attachments` is an
/// ordinary rowid table rather than `WITHOUT ROWID`.
fn row_id(conn: &Connection, statement_id: &str) -> StoreResult<i64> {
    Ok(conn.query_row(
        "SELECT rowid FROM attachments WHERE statement_id = ?1",
        params![statement_id],
        |row| row.get::<_, i64>(0),
    )?)
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
