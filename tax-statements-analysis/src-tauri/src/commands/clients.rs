// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The client book's command surface: recording a client, listing them,
//! correcting one, and removing one. Clients feed the bill form's picker.

use crate::commands::error::CommandError;
use crate::state::AppState;
use crate::store::clients::{self, Client};
use std::collections::BTreeMap;
use tauri::{AppHandle, State};

/// The rules the form already enforces, applied again at the boundary: a CNIC
/// and a name are required, everything else is optional.
fn problems(input: &Client) -> BTreeMap<String, String> {
    let mut fields = BTreeMap::new();
    if input.cnic.trim().is_empty() {
        fields.insert("cnic".to_string(), "Enter the CNIC (or ID).".to_string());
    }
    if input.name.trim().is_empty() {
        fields.insert("name".to_string(), "Enter the client's name.".to_string());
    }
    fields
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Record a client. A CNIC and a name are required; every contact value is
/// optional, and blank ones are simply not stored.
///
/// Saving a CNIC that is already held **merges** rather than replaces: the name
/// stays as first written, a missing company/password/category is filled in, and
/// each new contact value is added to the list.
#[tauri::command]
pub async fn create_client(
    app: AppHandle,
    state: State<'_, AppState>,
    input: Client,
) -> Result<Client, CommandError> {
    crate::log_info!("-> create_client '{}'", input.cnic);
    let result = apply_create_client(app, state, input).await;
    crate::commands::log_outcome("create_client", &result);
    result
}

async fn apply_create_client(
    app: AppHandle,
    state: State<'_, AppState>,
    input: Client,
) -> Result<Client, CommandError> {
    let fields = problems(&input);
    if !fields.is_empty() {
        crate::log_warn!(
            "create_client: validation failed on {:?}",
            fields.keys().collect::<Vec<_>>()
        );
        return Err(CommandError::validation_for("client", fields));
    }

    let saved = state
        .with_connection(|session| async move {
            clients::upsert_within(&session.conn, &input).await?;
            clients::get(&session.conn, &input.cnic).await
        })
        .await?;

    // There are now un-pushed changes on this machine (R8, FR-025).
    crate::cloud::sync_state::mark_dirty(&app);
    crate::log_info!("create_client: saved '{}'", saved.cnic);
    Ok(saved)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Correct a stored client in place — the edit behind the client block. Unlike
/// `create_client`, this **replaces** the client's own details and contacts, so a
/// number the practitioner removed actually disappears; the CNIC is unchanged.
#[tauri::command]
pub async fn update_client(
    app: AppHandle,
    state: State<'_, AppState>,
    input: Client,
) -> Result<Client, CommandError> {
    crate::log_info!("-> update_client '{}'", input.cnic);
    let result = apply_update_client(app, state, input).await;
    crate::commands::log_outcome("update_client", &result);
    result
}

async fn apply_update_client(
    app: AppHandle,
    state: State<'_, AppState>,
    input: Client,
) -> Result<Client, CommandError> {
    let fields = problems(&input);
    if !fields.is_empty() {
        crate::log_warn!(
            "update_client: validation failed on {:?}",
            fields.keys().collect::<Vec<_>>()
        );
        return Err(CommandError::validation_for("client", fields));
    }

    let saved = state
        .with_connection(|session| async move {
            clients::update_within(&session.conn, &input).await?;
            clients::get(&session.conn, &input.cnic).await
        })
        .await?;

    crate::cloud::sync_state::mark_dirty(&app);
    crate::log_info!("update_client: saved '{}'", saved.cnic);
    Ok(saved)
}

/// Every client, for the View tab and the bill form's picker.
#[tauri::command]
pub async fn list_clients(state: State<'_, AppState>) -> Result<Vec<Client>, CommandError> {
    crate::log_info!("-> list_clients");
    let result = state
        .with_connection(|session| async move { clients::list(&session.conn).await })
        .await;
    if let Ok(ref clients) = result {
        crate::log_debug!("list_clients: {} returned", clients.len());
    }
    crate::commands::log_outcome("list_clients", &result);
    result
}

/// Remove a client and every contact value recorded for them.
#[tauri::command]
pub async fn delete_client(
    app: AppHandle,
    state: State<'_, AppState>,
    cnic: String,
) -> Result<(), CommandError> {
    crate::log_info!("-> delete_client {cnic}");
    let result = state
        .with_connection(|session| async move { clients::delete(&session.conn, &cnic).await })
        .await;
    if result.is_ok() {
        crate::cloud::sync_state::mark_dirty(&app);
    }
    crate::commands::log_outcome("delete_client", &result);
    result
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
