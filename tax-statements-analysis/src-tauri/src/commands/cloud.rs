// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The cloud command surface: status, Push, Sync, and the storage figure
//! (`contracts/tauri-commands.md` §1).
//!
//! Ordinary sync failures are **not** errors — they come back inside the
//! response as a `SyncOutcome`, so the frontend renders exactly one plain-language
//! line per attempt (FR-033). Only a structural failure (no usable store) is
//! raised as a `CommandError`.

use crate::cloud::config;
use crate::cloud::object_store;
use crate::cloud::outcome::{self, SyncOutcome, SyncOutcomeKind};
use crate::cloud::sync_state;
use crate::cloud::usage::{self, CloudUsage};
use crate::commands::error::CommandError;
use crate::files;
use crate::state::AppState;
use serde::Serialize;
use tauri::{AppHandle, State};

/// Drives the header's Push/Sync affordances, the progress indicator's initial
/// state and the close-time check (data-model §3). Reads the credential store and
/// the local dirty marker — **never** the network.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    pub configured: bool,
    pub has_unpushed: bool,
    pub last_pushed_at: Option<String>,
    pub phase: String,
}

/// The result of one Push or Sync (data-model §3).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub outcome: SyncOutcome,
    pub changed: bool,
}

/// The Oracle Object Storage figure for the header's file gauge. `allowance`
/// values are `null` unless a bucket allowance is configured, in which case
/// `remainingBytes` is `allowance - used`. `pendingUploads` counts files cached
/// on this machine whose bytes are not yet in Oracle.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectUsage {
    pub used_bytes: i64,
    pub allowance_bytes: Option<i64>,
    pub remaining_bytes: Option<i64>,
    pub pending_uploads: i64,
}

/// Confirm a usable store exists before a cloud action reports anything; the
/// frontend relies on `NoStorageLocationError` for the "set up first" case.
async fn require_store(state: &State<'_, AppState>) -> Result<(), CommandError> {
    crate::log_debug!("cloud: checking that a usable store is open");
    state
        .with_connection(|_| async { Ok(()) })
        .await
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Current cloud state: secrets present, whether there are un-pushed changes, and
/// when the last push succeeded. Pure local read (R4, R8).
#[tauri::command]
pub async fn cloud_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CloudStatus, CommandError> {
    crate::log_info!("-> cloud_status");
    let result = apply_cloud_status(app, state).await;
    if let Ok(ref status) = result {
        crate::log_debug!(
            "cloud_status: configured={} has_unpushed={} last_pushed_at={:?}",
            status.configured,
            status.has_unpushed,
            status.last_pushed_at
        );
    }
    crate::commands::log_outcome("cloud_status", &result);
    result
}

async fn apply_cloud_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CloudStatus, CommandError> {
    require_store(&state).await?;

    let marker = sync_state::read(&app);
    Ok(CloudStatus {
        configured: config::is_configured(),
        has_unpushed: marker.dirty,
        last_pushed_at: marker.last_pushed_at,
        phase: "idle".to_string(),
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Publish this computer's changes to the central copy and classify the result
/// (FR-006–FR-012). A **successful** push clears the un-pushed marker (R8); a
/// push never runs while a write transaction is open (research R7).
#[tauri::command]
pub async fn cloud_push(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncResult, CommandError> {
    crate::log_info!("-> cloud_push");
    let result = apply_cloud_push(app, state).await;
    if let Ok(ref sync) = result {
        crate::log_info!(
            "cloud_push: outcome={:?} changed={} — {}",
            sync.outcome.kind,
            sync.changed,
            sync.outcome.message
        );
    }
    crate::commands::log_outcome("cloud_push", &result);
    result
}

async fn apply_cloud_push(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncResult, CommandError> {
    require_store(&state).await?;

    if !config::is_configured() {
        crate::log_warn!("cloud_push: the cloud is not set up on this computer");
        return Ok(SyncResult {
            outcome: SyncOutcome::secrets_unavailable(),
            changed: false,
        });
    }

    // Send any files whose bytes are still only on this machine **before** the
    // references are published, so another computer never pulls a reference to
    // an object that is not in Oracle yet (the local-first upload queue).
    let object_config = state.object_storage();
    let uploads = files::drain_pending(object_config.as_ref(), &state.cache, Some(&app)).await;
    if uploads.failed > 0 {
        crate::log_warn!(
            "cloud_push: {} file(s) could not be uploaded yet and stay local",
            uploads.failed
        );
    }

    // Nothing has changed locally since the last successful push.
    if !sync_state::read(&app).dirty {
        crate::log_info!("cloud_push: nothing has changed locally since the last push");
        return Ok(SyncResult {
            outcome: SyncOutcome::nothing_new(),
            changed: false,
        });
    }

    let (result, changed) = state
        .with_connection(|session| async move {
            let Some(db) = session.synced.as_ref() else {
                crate::log_warn!("cloud_push: the store is not on the synced engine");
                return Ok((SyncOutcome::secrets_unavailable(), false));
            };

            // The Turso docs warn against overlapping write transactions: do
            // not push while a write is in flight.
            if !session.conn.is_autocommit().unwrap_or(true) {
                crate::log_warn!("cloud_push: a write transaction is open — deferring");
                return Ok((
                    SyncOutcome::other("A write is in progress; try again in a moment."),
                    false,
                ));
            }

            match crate::cloud::push(db).await {
                Ok(()) => {
                    // Fold the local WAL once the exchange is done (research R2).
                    let _ = crate::cloud::checkpoint(db).await;
                    Ok((SyncOutcome::success("Your changes are published."), true))
                }
                Err(error) => Ok((outcome::classify(&error), false)),
            }
        })
        .await?;

    if result.kind == SyncOutcomeKind::Success {
        sync_state::clear_dirty(&app);
    }

    Ok(SyncResult {
        outcome: result,
        changed,
    })
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Bring the other computers' changes down and classify the result
/// (FR-013–FR-020). `changed` is the engine's own answer; a pull **never** clears
/// the un-pushed marker (a pull does not publish local work).
#[tauri::command]
pub async fn cloud_pull(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncResult, CommandError> {
    crate::log_info!("-> cloud_pull");
    let result = apply_cloud_pull(app, state).await;
    if let Ok(ref sync) = result {
        crate::log_info!(
            "cloud_pull: outcome={:?} changed={} — {}",
            sync.outcome.kind,
            sync.changed,
            sync.outcome.message
        );
    }
    crate::commands::log_outcome("cloud_pull", &result);
    result
}

async fn apply_cloud_pull(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncResult, CommandError> {
    require_store(&state).await?;

    if !config::is_configured() {
        crate::log_warn!("cloud_pull: the cloud is not set up on this computer");
        return Ok(SyncResult {
            outcome: SyncOutcome::secrets_unavailable(),
            changed: false,
        });
    }

    let (result, changed) = state
        .with_connection(|session| async move {
            let Some(db) = session.synced.as_ref() else {
                crate::log_warn!("cloud_pull: the store is not on the synced engine");
                return Ok((SyncOutcome::secrets_unavailable(), false));
            };

            match crate::cloud::pull(db).await {
                Ok(true) => Ok((
                    SyncOutcome::success("Changes from your other computers were brought in."),
                    true,
                )),
                Ok(false) => Ok((SyncOutcome::nothing_new(), false)),
                Err(error) => Ok((outcome::classify(&error), false)),
            }
        })
        .await?;

    // Turso first, then the files: once the references have arrived, fetch any
    // file bytes this machine has not seen yet (best-effort; a failure leaves the
    // file for the practitioner's manual download). Runs after **every**
    // successful pull and is idempotent, because it only fetches what is missing.
    if result.kind == SyncOutcomeKind::Success {
        crate::cloud::download_all_files(&app).await;
    }

    Ok(SyncResult {
        outcome: result,
        changed,
    })
}

/// The cloud storage headroom for the header gauge, or `null` when the figure
/// cannot be retrieved (FR-029–FR-032). Never an error (contracts §1).
#[tauri::command]
pub async fn cloud_usage() -> Result<Option<CloudUsage>, CommandError> {
    crate::log_info!("-> cloud_usage");
    let result = apply_cloud_usage().await;
    crate::commands::log_outcome("cloud_usage", &result);
    result
}

async fn apply_cloud_usage() -> Result<Option<CloudUsage>, CommandError> {
    let Some(config) = config::load() else {
        crate::log_debug!("cloud_usage: the cloud is not set up on this computer");
        return Ok(None);
    };
    Ok(usage::fetch(&config).await)
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The Oracle Object Storage figure for the header's file gauge: the total bytes
/// held in the bucket (summed with `ListObjectsV2`), the 10 GB allowance's
/// remainder, and how many files on this machine are still waiting to upload.
/// `null` when Oracle is not configured or the bucket could not be listed —
/// never a wrong number (the same rule the Turso gauge follows).
#[tauri::command]
pub async fn cloud_object_usage(
    state: State<'_, AppState>,
) -> Result<Option<ObjectUsage>, CommandError> {
    crate::log_info!("-> cloud_object_usage");
    let config = state.object_storage();
    let result = Ok(object_usage(&state, config.as_ref()).await);
    if let Ok(ref usage) = result {
        crate::log_debug!("cloud_object_usage: {usage:?}");
    }
    crate::commands::log_outcome("cloud_object_usage", &result);
    result
}

/// Read the bucket figure and build the gauge's value, or `None` when Oracle is
/// not configured or the listing fails. Shared by `cloud_object_usage` and
/// `cloud_reconnect`.
async fn object_usage(
    state: &State<'_, AppState>,
    config: Option<&crate::cloud::object_store::ObjectStoreConfig>,
) -> Option<ObjectUsage> {
    let config = config?;
    let client = config.client();
    let used_bytes = object_store::bucket_usage(&client, &config.bucket)
        .await
        .ok()?;
    let pending_uploads = state.cache.count_pending().await.unwrap_or(0);
    let allowance = config::OBJECT_ALLOWANCE_BYTES;
    Some(ObjectUsage {
        used_bytes,
        allowance_bytes: Some(allowance),
        remaining_bytes: Some((allowance - used_bytes).max(0)),
        pending_uploads,
    })
}

/// The result of the header's **Reconnect** action: a connectivity verdict plus
/// the refreshed storage figures. Nothing is pushed or pulled.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectResult {
    pub connected: bool,
    /// True when a real network probe ran, so `connected` is a verified answer.
    pub verified: bool,
    pub message: String,
    pub usage: Option<CloudUsage>,
    pub object_usage: Option<ObjectUsage>,
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The header's **Reconnect** action: make sure this computer is pointed at the
/// cloud and the storage figures are fresh — and nothing more.
///
/// It deliberately does **not** Push or Pull. The sync engine has no
/// non-mutating ping (`pull()` long-polls for changes), so connectivity is
/// proved with real round trips to Turso's platform API and/or Oracle's bucket
/// listing. When neither is configured, the verdict falls back to "the store is
/// on the synced engine" and says the figures could not be fetched.
#[tauri::command]
pub async fn cloud_reconnect(state: State<'_, AppState>) -> Result<ReconnectResult, CommandError> {
    crate::log_info!("-> cloud_reconnect");
    let result = apply_cloud_reconnect(state).await;
    if let Ok(ref view) = result {
        crate::log_info!(
            "cloud_reconnect: connected={} verified={} — {}",
            view.connected,
            view.verified,
            view.message
        );
    }
    crate::commands::log_outcome("cloud_reconnect", &result);
    result
}

async fn apply_cloud_reconnect(
    state: State<'_, AppState>,
) -> Result<ReconnectResult, CommandError> {
    require_store(&state).await?;

    let Some(config) = config::load() else {
        return Ok(ReconnectResult {
            connected: false,
            verified: false,
            message: "The cloud connection details are not set up on this computer yet.".to_string(),
            usage: None,
            object_usage: None,
        });
    };

    // Point the store at the cloud if it is not already — a local switch that
    // never pulls. On failure the local engine is restored, so the practitioner
    // is left exactly where they were.
    {
        let mut guard = state.inner.lock().await;
        if let Err(error) =
            crate::state::ensure_synced_session(&mut guard, &config, &state.cache).await
        {
            return Ok(ReconnectResult {
                connected: false,
                verified: false,
                message: error.to_string(),
                usage: None,
                object_usage: None,
            });
        }
    }

    // Real round trips: Turso's platform API and Oracle's bucket listing.
    let gauge_configured =
        config.org.is_some() && config.database.is_some() && config.platform_token.is_some();
    let turso_usage = usage::fetch(&config).await;
    let object = object_usage(&state, config.object_storage.as_ref()).await;
    let oracle_configured = config.object_storage.is_some();

    let (connected, verified, message) = if gauge_configured || oracle_configured {
        let ok = (gauge_configured && turso_usage.is_some())
            || (oracle_configured && object.is_some());
        if ok {
            (
                true,
                true,
                "Connected to the cloud. Storage figures refreshed.".to_string(),
            )
        } else {
            (
                false,
                true,
                "Could not reach the cloud. Nothing was pushed or pulled; your work stays safe on this computer."
                    .to_string(),
            )
        }
    } else {
        (
            true,
            false,
            "This computer is set up for the cloud. Storage figures are unavailable because the gauge values are not in the env file."
                .to_string(),
        )
    };

    Ok(ReconnectResult {
        connected,
        verified,
        message,
        usage: turso_usage,
        object_usage: object,
    })
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
