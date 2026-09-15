// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Reading and writing statements. Every write is one transaction (research R4),
//! and the range query never touches an attachment's contents (research R3).

use super::attachments::{self, AttachmentPayload};
use super::{schema, StoreError, StoreResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// A stored statement, shaped for the frontend seam (`data-model.md` §3).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub id: String,
    pub date: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub nature: String,
    pub amount: f64,
    pub remarks: Option<String>,
    pub file_name: Option<String>,
    pub file_ref: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewStatement {
    pub date: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub nature: String,
    pub amount: f64,
    #[serde(default)]
    pub remarks: Option<String>,
    // `fileName` and `fileRef` are deliberately absent here. A file's name travels
    // with its bytes in `AttachmentPayload`, which is the single source of truth
    // for it; serde simply ignores the extra keys the frontend still sends.
}

/// What an edit does to the attachment (FR-040, FR-041, FR-047).
///
/// `Replace` carries only the file's **name** on the wire; its contents arrive
/// separately as the request's raw body, so a large file is never JSON-encoded.
#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum AttachmentAction {
    /// Leave the stored file exactly as it is (FR-033, FR-047).
    Keep,
    /// Detach the file (FR-040).
    Remove,
    /// Swap in different contents (FR-041).
    Replace {
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(skip)]
        bytes: Vec<u8>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementUpdate {
    pub id: String,
    pub date: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub nature: String,
    pub amount: f64,
    #[serde(default)]
    pub remarks: Option<String>,
    pub attachment: AttachmentAction,
}

/// The columns every read shares. **`attachments.data` is absent on purpose** —
/// selecting it, or any column after it, would pull the whole file into memory
/// for every row (research R3).
const STATEMENT_COLUMNS: &str = "s.id, s.occurred_on, s.kind, s.nature, s.amount_minor, \
                                 s.remarks, s.created_at, a.file_name";

fn row_to_statement(row: &rusqlite::Row<'_>) -> rusqlite::Result<Statement> {
    let minor: i64 = row.get(4)?;
    Ok(Statement {
        id: row.get(0)?,
        date: row.get(1)?,
        kind: row.get(2)?,
        nature: row.get(3)?,
        amount: from_minor(minor),
        remarks: row.get(5)?,
        created_at: row.get(6)?,
        file_name: row.get(7)?,
        file_ref: None,
    })
}

/// Amounts are held as integer paisa so totals can never drift (research R11).
pub fn to_minor(amount: f64) -> i64 {
    (amount * 100.0).round() as i64
}

pub fn from_minor(minor: i64) -> f64 {
    minor as f64 / 100.0
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record a statement, and its attachment if one was given, in a single
/// transaction — an interruption leaves either the whole thing or nothing
/// (FR-005).
pub fn create(
    conn: &mut Connection,
    input: &NewStatement,
    attachment: Option<&AttachmentPayload>,
) -> StoreResult<Statement> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = schema::now_iso();

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO statements
             (id, occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            id,
            input.date,
            input.kind,
            input.nature,
            to_minor(input.amount),
            input.remarks,
            now,
        ],
    )?;

    if let Some(payload) = attachment {
        attachments::insert_within(&tx, &id, &payload.file_name, &payload.bytes)?;
    }
    tx.commit()?;

    Ok(Statement {
        id,
        date: input.date.clone(),
        kind: input.kind.clone(),
        nature: input.nature.clone(),
        amount: input.amount,
        remarks: input.remarks.clone(),
        file_name: attachment.map(|payload| payload.file_name.clone()),
        file_ref: None,
        created_at: now,
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Every statement whose date falls inside the range, newest first.
///
/// Returns file **names** only. No attachment content is transported, for any
/// row, however large the files are (FR-029, FR-030, SC-011).
pub fn list_range(conn: &Connection, from: &str, to: &str) -> StoreResult<Vec<Statement>> {
    if from > to {
        return Err(StoreError::InvalidRange);
    }

    let sql = format!(
        "SELECT {STATEMENT_COLUMNS}
           FROM statements s
           LEFT JOIN attachments a ON a.statement_id = s.id
          WHERE s.occurred_on BETWEEN ?1 AND ?2
          ORDER BY s.occurred_on DESC, s.created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![from, to], row_to_statement)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get(conn: &Connection, id: &str) -> StoreResult<Statement> {
    let sql = format!(
        "SELECT {STATEMENT_COLUMNS}
           FROM statements s
           LEFT JOIN attachments a ON a.statement_id = s.id
          WHERE s.id = ?1"
    );
    conn.query_row(&sql, params![id], row_to_statement)
        .optional()?
        .ok_or(StoreError::UnknownStatement)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Correct a stored statement **in place**: same identity, no second record
/// (FR-042). `Keep` leaves the stored file byte-identical (FR-047).
pub fn update(conn: &mut Connection, update: &StatementUpdate) -> StoreResult<Statement> {
    let now = schema::now_iso();

    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE statements
            SET occurred_on = ?2, kind = ?3, nature = ?4, amount_minor = ?5,
                remarks = ?6, updated_at = ?7
          WHERE id = ?1",
        params![
            update.id,
            update.date,
            update.kind,
            update.nature,
            to_minor(update.amount),
            update.remarks,
            now,
        ],
    )?;
    if changed == 0 {
        return Err(StoreError::UnknownStatement);
    }

    match &update.attachment {
        AttachmentAction::Keep => {}
        AttachmentAction::Remove => {
            tx.execute(
                "DELETE FROM attachments WHERE statement_id = ?1",
                params![update.id],
            )?;
        }
        AttachmentAction::Replace { file_name, bytes } => {
            attachments::insert_within(&tx, &update.id, file_name, bytes)?;
        }
    }
    tx.commit()?;

    get(conn, &update.id)
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
