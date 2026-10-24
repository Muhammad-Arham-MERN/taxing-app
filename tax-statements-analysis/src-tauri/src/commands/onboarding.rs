// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The setup gate: what the application still needs before it is usable, and the
//! one place the partner's env file becomes stored secrets and a proven cloud
//! connection (`contracts/tauri-commands.md` §1, FR-005, FR-044–FR-049).

use crate::cloud::config;
use crate::cloud::outcome::{self, SyncOutcomeKind};
use crate::cloud::secrets;
use crate::commands::error::CommandError;
use crate::state::AppState;
use crate::store::StoreError;
use serde::Serialize;
use tauri::State;

/// What setup still needs. The application is shown only when both are true
/// (data-model §3, FR-005).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    /// A usable store has been chosen (Modules 1–3).
    pub storage_ready: bool,
    /// The secrets are present in the credential store.
    pub secrets_ready: bool,
}

/// The result of reading the env file (data-model §3, FR-044–FR-048).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsPasteResult {
    pub ok: bool,
    /// Required keys that were absent or unreadable.
    pub missing: Vec<String>,
    /// Ready to show the practitioner.
    pub message: String,
}

/// The result of proving the saved details reach the cloud (FR-005, FR-047).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupConnectResult {
    pub ok: bool,
    pub kind: SyncOutcomeKind,
    pub message: String,
}

/// What setup still needs. Never fails: it reports state (contracts §1).
#[tauri::command]
pub async fn get_setup_state(state: State<'_, AppState>) -> Result<SetupState, CommandError> {
    crate::log_info!("-> get_setup_state");
    let storage_ready = {
        let guard = state.inner.lock().await;
        guard.session.is_some()
    };
    let result = Ok(SetupState {
        storage_ready,
        secrets_ready: config::is_configured(),
    });
    if let Ok(ref view) = result {
        crate::log_debug!(
            "get_setup_state: storage_ready={} secrets_ready={}",
            view.storage_ready,
            view.secrets_ready
        );
    }
    crate::commands::log_outcome("get_setup_state", &result);
    result
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Parse the partner's env file and save the required values to Windows
/// Credential Manager (FR-044–FR-048).
///
/// A parse failure or a missing key saves **nothing** and names the problem. A
/// second call replaces the stored values (FR-049). No value is ever returned to
/// the frontend (FR-046).
#[tauri::command]
pub async fn save_secrets(text: String) -> Result<SecretsPasteResult, CommandError> {
    crate::log_info!("-> save_secrets ({} characters pasted)", text.len());
    let result = apply_save_secrets(text).await;
    crate::commands::log_outcome("save_secrets", &result);
    result
}

async fn apply_save_secrets(text: String) -> Result<SecretsPasteResult, CommandError> {
    let parsed = secrets::parse(&text);

    if let Some(problem) = parsed.malformed {
        crate::log_warn!("save_secrets: the pasted file is malformed: {problem}");
        return Ok(SecretsPasteResult {
            ok: false,
            missing: Vec::new(),
            message: format!("That file could not be read: {problem}"),
        });
    }

    if !parsed.missing.is_empty() {
        crate::log_warn!("save_secrets: missing or empty values: {:?}", parsed.missing);
        return Ok(SecretsPasteResult {
            ok: false,
            missing: parsed.missing.clone(),
            message: format!(
                "These values are missing or empty: {}. Nothing was saved.",
                parsed.missing.join(", ")
            ),
        });
    }

    secrets::store(&parsed.values)
        .map_err(|error| CommandError::secrets_store_unavailable(error.0))?;

    Ok(SecretsPasteResult {
        ok: true,
        missing: Vec::new(),
        message: "The connection details were saved.".to_string(),
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Prove the saved details actually reach the cloud, and — on success — switch
/// the open store from the **local** engine to the **synced** one, so Push/Sync
/// work immediately without a restart (research R2, FR-005, FR-047).
///
/// The test is a real network round trip (`pull()`), and its result is
/// classified exactly like a manual Sync, so a bad URL/token or a missing
/// connection is reported for what it is.
#[tauri::command]
pub async fn setup_connect(state: State<'_, AppState>) -> Result<SetupConnectResult, CommandError> {
    crate::log_info!("-> setup_connect (proving the cloud round trip)");
    let result = apply_setup_connect(state).await;
    if let Ok(ref view) = result {
        crate::log_info!(
            "setup_connect: ok={} kind={:?} — {}",
            view.ok,
            view.kind,
            view.message
        );
    }
    crate::commands::log_outcome("setup_connect", &result);
    result
}

async fn apply_setup_connect(
    state: State<'_, AppState>,
) -> Result<SetupConnectResult, CommandError> {
    let Some(config) = config::load() else {
        return Ok(SetupConnectResult {
            ok: false,
            kind: SyncOutcomeKind::SecretsUnavailable,
            message: "The cloud connection details are not set up on this computer yet.".to_string(),
        });
    };

    let mut guard = state.inner.lock().await;

    if guard.location.is_none() {
        crate::log_warn!("setup_connect: no storage location has been chosen yet");
        return Ok(SetupConnectResult {
            ok: false,
            kind: SyncOutcomeKind::Other,
            message: "Choose where your records will be kept first.".to_string(),
        });
    }

    // Point the session at the synced engine (a local switch, never a pull). On
    // failure the local engine is restored, so the practitioner is left usable.
    if let Err(error) =
        crate::state::ensure_synced_session(&mut guard, &config, &state.cache).await
    {
        return Ok(failure_from_store(error));
    }

    // Setup proves the connection with a **real round trip** — the one place a
    // pull is wanted, because a freshly set-up computer should receive its
    // records. The header's Reconnect button deliberately does not pull.
    crate::log_info!("setup_connect: proving the round trip with a pull");
    let result = match guard.session.as_ref().and_then(|session| session.engine.synced()) {
        Some(db) => crate::cloud::pull(db).await,
        None => Ok(false),
    };
    Ok(match result {
        Ok(_) => connected(),
        Err(error) => failure(&error),
    })
}

fn connected() -> SetupConnectResult {
    SetupConnectResult {
        ok: true,
        kind: SyncOutcomeKind::Success,
        message: "Connected to the cloud. Your records will now sync.".to_string(),
    }
}

fn failure(error: &turso::Error) -> SetupConnectResult {
    let outcome = outcome::classify(error);
    SetupConnectResult {
        ok: false,
        kind: outcome.kind,
        message: outcome.message,
    }
}

fn failure_from_store(error: StoreError) -> SetupConnectResult {
    match error {
        StoreError::Engine(engine) => failure(&engine),
        other => SetupConnectResult {
            ok: false,
            kind: SyncOutcomeKind::Other,
            message: other.to_string(),
        },
    }
}

/// Remove the stored secrets. Offered only for a deliberate reset (contracts §1).
#[tauri::command]
pub async fn clear_secrets() -> Result<(), CommandError> {
    crate::log_info!("-> clear_secrets");
    let result =
        secrets::clear().map_err(|error| CommandError::secrets_store_unavailable(error.0));
    crate::commands::log_outcome("clear_secrets", &result);
    result
}
