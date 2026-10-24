// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Categories: **one global, named, coloured list** shared by clients and their
//! records (client request).
//!
//! A category is identified by its id; its name is unique case-insensitively.
//! Categories tag **client records** (not clients themselves); deleting one never
//! deletes the records filed under it — the tag is simply cleared, in the same
//! transaction.

use super::{schema, StoreError, StoreResult};
use serde::{Deserialize, Serialize};
use turso::{params::Params, Connection, Value};

/// One category: a name and a colour from the palette.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
}

fn text_at(row: &turso::Row, index: usize) -> String {
    match row.get_value(index) {
        Ok(Value::Text(text)) => text,
        _ => String::new(),
    }
}

/// Every category, by name.
pub async fn list(conn: &Connection) -> StoreResult<Vec<Category>> {
    let mut rows = conn
        .query(
            "SELECT id, name, color FROM categories ORDER BY name COLLATE NOCASE ASC",
            (),
        )
        .await?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(Category {
            id: text_at(&row, 0),
            name: text_at(&row, 1),
            color: text_at(&row, 2),
        });
    }
    crate::log_info!("categories::list: {} categor(ies) returned", out.len());
    Ok(out)
}

/// Record a category. The name is trimmed; the id is generated.
pub async fn create(conn: &Connection, name: &str, color: &str) -> StoreResult<Category> {
    let id = uuid::Uuid::new_v4().to_string();
    let name = name.trim().to_string();
    let color = color.trim().to_string();
    let now = schema::now_iso();
    crate::log_info!("categories::create: '{name}' ({color}) as {id}");

    conn.execute(
        "INSERT INTO categories (id, name, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        Params::Positional(vec![
            Value::Text(id.clone()),
            Value::Text(name.clone()),
            Value::Text(color.clone()),
            Value::Text(now),
        ]),
    )
    .await?;

    Ok(Category { id, name, color })
}

/// Rename or recolour a category.
pub async fn update(conn: &Connection, id: &str, name: &str, color: &str) -> StoreResult<Category> {
    let name = name.trim().to_string();
    let color = color.trim().to_string();
    let now = schema::now_iso();
    crate::log_info!("categories::update: {id} -> '{name}' ({color})");

    let changed = conn
        .execute(
            "UPDATE categories SET name = ?2, color = ?3, updated_at = ?4 WHERE id = ?1",
            Params::Positional(vec![
                Value::Text(id.to_string()),
                Value::Text(name.clone()),
                Value::Text(color.clone()),
                Value::Text(now),
            ]),
        )
        .await?;
    if changed == 0 {
        crate::log_warn!("categories::update: no category with id {id}");
        return Err(StoreError::UnknownCategory);
    }

    Ok(Category {
        id: id.to_string(),
        name,
        color,
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Remove a category. Every record filed under it simply loses that tag —
/// nothing else is deleted — which is why the clearing and the delete run in one
/// transaction.
pub async fn delete(conn: &Connection, id: &str) -> StoreResult<()> {
    crate::log_info!("categories::delete: {id}");

    let tx = conn.unchecked_transaction().await?;
    tx.execute(
        "UPDATE client_records SET category_id = NULL WHERE category_id = ?1",
        [id],
    )
    .await?;
    let changed = tx
        .execute("DELETE FROM categories WHERE id = ?1", [id])
        .await?;
    tx.commit().await?;

    if changed == 0 {
        crate::log_warn!("categories::delete: no category with id {id}");
        return Err(StoreError::UnknownCategory);
    }
    Ok(())
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
