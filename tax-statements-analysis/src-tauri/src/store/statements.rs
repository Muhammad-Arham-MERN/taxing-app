// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Reading and writing statements. Every write is one transaction (research R4),
//! and the range query never touches an attachment's contents (research R3).
//!
//! Converted to the async Turso engine in Module 4 (research R2, R3); the SQL and
//! the observable behaviour are unchanged. Attachment bytes now live in the local
//! vault (`store::attachments`), so a write that carries a file writes the bytes
//! to disk and only a reference row into the store (research R5).

use super::attachments;
use super::{schema, StoreError, StoreResult};
use crate::files::AttachmentRef;
use serde::{Deserialize, Serialize};
use turso::{Connection, Value};

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
    // `fileName` and `fileRef` are deliberately absent here. A file's name and
    // bytes arrive as the raw request body, are turned into an `AttachmentRef`
    // by the command layer (via `files::store_file`), and are passed to `create`
    // separately; serde simply ignores the extra keys the frontend still sends.
}

/// What an edit does to the attachment (FR-040, FR-041, FR-047).
#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum AttachmentAction {
    /// Leave the stored file exactly as it is (FR-033, FR-047).
    Keep,
    /// Detach the file (FR-040).
    Remove,
    /// Swap in different contents. The new bytes arrive in the raw body and are
    /// turned into an [`AttachmentRef`] by the command layer, which fills
    /// `reference` before the store sees it.
    Replace {
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "contentType", default)]
        content_type: Option<String>,
        #[serde(skip)]
        reference: Option<AttachmentRef>,
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

/// The columns every read shares. **Attachment bytes are never selected** — the
/// store holds only the reference now, and the name is all a list needs
/// (research R3, data-model §1.2).
const STATEMENT_COLUMNS: &str = "s.id, s.occurred_on, s.kind, s.nature, s.amount_minor, \
                                 s.remarks, s.created_at, a.file_name";

fn row_to_statement(row: &turso::Row) -> StoreResult<Statement> {
    let minor = match row.get_value(4)? {
        Value::Integer(number) => number,
        _ => 0,
    };
    Ok(Statement {
        id: text_at(row, 0),
        date: text_at(row, 1),
        kind: text_at(row, 2),
        nature: text_at(row, 3),
        amount: from_minor(minor),
        remarks: optional_text_at(row, 5),
        created_at: text_at(row, 6),
        file_name: optional_text_at(row, 7),
        file_ref: None,
    })
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
pub async fn create(
    conn: &Connection,
    input: &NewStatement,
    attachment: Option<&AttachmentRef>,
) -> StoreResult<Statement> {
    crate::log_info!(
        "statements::create: recording a {} statement ({}, {:.2}){}",
        input.kind,
        input.nature,
        input.amount,
        if attachment.is_some() { " with an attachment" } else { "" }
    );

    let id = uuid::Uuid::new_v4().to_string();
    let now = schema::now_iso();

    let tx = conn.unchecked_transaction().await?;
    tx.execute(
        "INSERT INTO statements
             (id, occurred_on, kind, nature, amount_minor, remarks, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        (
            id.as_str(),
            input.date.as_str(),
            input.kind.as_str(),
            input.nature.as_str(),
            to_minor(input.amount),
            input.remarks.as_deref(),
            now.as_str(),
        ),
    )
    .await?;

    if let Some(payload) = attachment {
        crate::log_debug!(
            "statements::create: recording attachment '{}' ({} bytes -> {})",
            payload.file_name,
            payload.byte_size,
            payload.object_key
        );
        attachments::insert_within(&tx, &id, payload).await?;
    }
    tx.commit().await?;
    crate::log_info!("statements::create: committed statement {id}");

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
pub async fn list_range(conn: &Connection, from: &str, to: &str) -> StoreResult<Vec<Statement>> {
    crate::log_info!("statements::list_range: querying {from}..{to}");
    if from > to {
        crate::log_warn!("statements::list_range: the From date is after the To date");
        return Err(StoreError::InvalidRange);
    }

    let sql = format!(
        "SELECT {STATEMENT_COLUMNS}
           FROM statements s
           LEFT JOIN attachments a ON a.statement_id = s.id
          WHERE s.occurred_on BETWEEN ?1 AND ?2
          ORDER BY s.occurred_on DESC, s.created_at DESC"
    );
    let mut rows = conn.query(&sql, (from, to)).await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(row_to_statement(&row)?);
    }
    crate::log_info!("statements::list_range: {} statement(s) returned", out.len());
    Ok(out)
}

pub async fn get(conn: &Connection, id: &str) -> StoreResult<Statement> {
    crate::log_debug!("statements::get: {id}");
    let sql = format!(
        "SELECT {STATEMENT_COLUMNS}
           FROM statements s
           LEFT JOIN attachments a ON a.statement_id = s.id
          WHERE s.id = ?1"
    );
    let mut rows = conn.query(&sql, [id]).await?;
    match rows.next().await? {
        Some(row) => row_to_statement(&row),
        None => {
            crate::log_warn!("statements::get: no statement with id {id}");
            Err(StoreError::UnknownStatement)
        }
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Correct a stored statement **in place**: same identity, no second record
/// (FR-042). `Keep` leaves the stored file byte-identical (FR-047).
pub async fn update(
    conn: &Connection,
    update: &StatementUpdate,
) -> StoreResult<Statement> {
    crate::log_info!("statements::update: correcting statement {}", update.id);
    let now = schema::now_iso();

    let tx = conn.unchecked_transaction().await?;
    let changed = tx
        .execute(
            "UPDATE statements
                SET occurred_on = ?2, kind = ?3, nature = ?4, amount_minor = ?5,
                    remarks = ?6, updated_at = ?7
              WHERE id = ?1",
            (
                update.id.as_str(),
                update.date.as_str(),
                update.kind.as_str(),
                update.nature.as_str(),
                to_minor(update.amount),
                update.remarks.as_deref(),
                now.as_str(),
            ),
        )
        .await?;
    if changed == 0 {
        crate::log_warn!("statements::update: no statement with id {}", update.id);
        return Err(StoreError::UnknownStatement);
    }

    match &update.attachment {
        AttachmentAction::Keep => crate::log_debug!("statements::update: keeping the stored file"),
        AttachmentAction::Remove => {
            crate::log_debug!("statements::update: removing the stored file");
            attachments::remove_within(&tx, &update.id).await?;
        }
        AttachmentAction::Replace { reference, file_name, .. } => {
            let reference = reference.as_ref().ok_or(StoreError::FileMissing)?;
            crate::log_debug!(
                "statements::update: replacing the file with '{file_name}' ({})",
                reference.object_key
            );
            attachments::insert_within(&tx, &update.id, reference).await?;
        }
    }
    tx.commit().await?;
    crate::log_info!("statements::update: committed statement {}", update.id);

    get(conn, &update.id).await
}

/// Delete a statement. Its attachment goes with it through the schema's cascade
/// (`attachments.statement_id ... ON DELETE CASCADE`), so its bytes go too.
pub async fn delete(conn: &Connection, id: &str) -> StoreResult<()> {
    crate::log_info!("statements::delete: removing statement {id}");
    let changed = conn
        .execute("DELETE FROM statements WHERE id = ?1", [id])
        .await?;
    if changed == 0 {
        crate::log_warn!("statements::delete: no statement with id {id}");
        return Err(StoreError::UnknownStatement);
    }
    crate::log_info!("statements::delete: removed statement {id}");
    Ok(())
}
