// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The categories' command surface: one global, named, coloured tag list shared
//! by clients and their records (client request).

use crate::commands::error::CommandError;
use crate::state::AppState;
use crate::store::categories::{self, Category};
use std::collections::BTreeMap;
use tauri::{AppHandle, State};

/// A category needs a name; its colour is whatever the palette offered.
fn validate(name: &str) -> BTreeMap<String, String> {
    let mut fields = BTreeMap::new();
    if name.trim().is_empty() {
        fields.insert("name".to_string(), "Give the category a name.".to_string());
    }
    fields
}

fn duplicate() -> CommandError {
    let mut fields = BTreeMap::new();
    fields.insert(
        "name".to_string(),
        "A category with that name already exists.".to_string(),
    );
    CommandError::validation_for("category", fields)
}

/// Every category, for the pickers and the View Clients filter.
#[tauri::command]
pub async fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, CommandError> {
    crate::log_info!("-> list_categories");
    let result = state
        .with_connection(|session| async move { categories::list(&session.conn).await })
        .await;
    crate::commands::log_outcome("list_categories", &result);
    result
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Create a category. The name must be free — the list is checked first so the
/// practitioner is told which field is at fault rather than shown a raw
/// constraint error.
#[tauri::command]
pub async fn create_category(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    color: String,
) -> Result<Category, CommandError> {
    crate::log_info!("-> create_category '{name}'");
    let result = apply_create_category(app, state, name, color).await;
    crate::commands::log_outcome("create_category", &result);
    result
}

async fn apply_create_category(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    color: String,
) -> Result<Category, CommandError> {
    let fields = validate(&name);
    if !fields.is_empty() {
        return Err(CommandError::validation_for("category", fields));
    }

    let needle = name.trim().to_string();
    let taken = state
        .with_connection(|session| {
            let needle = needle.clone();
            async move {
                let existing = categories::list(&session.conn).await?;
                Ok(existing
                    .iter()
                    .any(|category| category.name.eq_ignore_ascii_case(&needle)))
            }
        })
        .await?;
    if taken {
        return Err(duplicate());
    }

    let created = state
        .with_connection(|session| async move {
            categories::create(&session.conn, &name, &color).await
        })
        .await?;

    crate::cloud::sync_state::mark_dirty(&app);
    crate::log_info!("create_category: saved '{}'", created.name);
    Ok(created)
}

/// Rename or recolour a category. The name must be free of any *other* category.
#[tauri::command]
pub async fn update_category(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
    color: String,
) -> Result<Category, CommandError> {
    crate::log_info!("-> update_category {id} '{name}'");
    let result = apply_update_category(app, state, id, name, color).await;
    crate::commands::log_outcome("update_category", &result);
    result
}

async fn apply_update_category(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
    color: String,
) -> Result<Category, CommandError> {
    let fields = validate(&name);
    if !fields.is_empty() {
        return Err(CommandError::validation_for("category", fields));
    }

    let needle = name.trim().to_string();
    let taken = state
        .with_connection({
            let id = id.clone();
            let needle = needle.clone();
            move |session| async move {
                let existing = categories::list(&session.conn).await?;
                Ok(existing
                    .iter()
                    .any(|category| category.id != id && category.name.eq_ignore_ascii_case(&needle)))
            }
        })
        .await?;
    if taken {
        return Err(duplicate());
    }

    let saved = state
        .with_connection(|session| async move {
            categories::update(&session.conn, &id, &name, &color).await
        })
        .await?;

    crate::cloud::sync_state::mark_dirty(&app);
    Ok(saved)
}

/// Remove a category. Anything filed under it simply loses the tag.
#[tauri::command]
pub async fn delete_category(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    crate::log_info!("-> delete_category {id}");
    let result = state
        .with_connection(|session| async move { categories::delete(&session.conn, &id).await })
        .await;
    if result.is_ok() {
        crate::cloud::sync_state::mark_dirty(&app);
    }
    crate::commands::log_outcome("delete_category", &result);
    result
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
