// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The **file-bytes pipeline**: the one path a file's contents take between the
//! frontend, the local offline cache and Oracle Object Storage.
//!
//! The rule this module exists to keep is simple: **a save never needs the
//! network.** Bytes are written to the local cache first and uploaded to Oracle
//! afterwards; the synced store is given only an [`AttachmentRef`] (a file name,
//! a size, a content type and an object key). Reading works the other way round:
//! the cache is tried first, and Oracle is asked only when this machine has not
//! seen the file before — which is how a file attached on one computer opens on
//! another after a Sync.

use crate::cloud::object_store::{self, ObjectStoreConfig};
use crate::store::object_cache::{ObjectCache, Scope};
use crate::store::StoreResult;

/// The reference the synced store keeps for one file. This is what replaces the
/// old `data` BLOB: a **string** pointing at the object in Oracle.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub file_name: String,
    pub byte_size: i64,
    pub content_type: Option<String>,
    pub object_key: String,
}

/// Why reading a file failed. Mapped to the IPC error enum in `commands::error`.
#[derive(Debug)]
pub enum FileError {
    /// Oracle Object Storage is not configured on this machine.
    NotConfigured,
    /// The file is not cached here and could not be fetched from Oracle.
    Offline(String),
    /// Oracle answered with an error.
    Failed(String),
}

impl std::fmt::Display for FileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileError::NotConfigured => write!(
                f,
                "File storage is not set up on this computer yet, so this file cannot be \
                 fetched."
            ),
            FileError::Offline(reason) => write!(
                f,
                "This file is not on this computer yet and it could not be fetched from the \
                 cloud. Connect to the internet and try again. ({reason})"
            ),
            FileError::Failed(reason) => write!(f, "{reason}"),
        }
    }
}

/// The outcome of one upload pass, for logging and the header's pending figure.
#[derive(Debug, Default, Clone, Copy)]
pub struct UploadReport {
    pub uploaded: usize,
    pub failed: usize,
    pub remaining: i64,
}

/// A fresh object key under the shared prefix. A UUID per upload means a replace
/// creates a new object and the old one can be removed unambiguously — no
/// content deduplication, no reference counting.
pub fn new_object_key() -> String {
    format!("{}/{}", object_store::KEY_PREFIX, uuid::Uuid::new_v4())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Persist a file's bytes: cache locally first, then best-effort upload.
///
/// The write **never fails for want of a network** — if Oracle is not configured
/// or not reachable, the bytes stay in the local cache marked pending and the
/// returned reference is still complete, so the record can be saved offline.
pub async fn store_file(
    config: Option<&ObjectStoreConfig>,
    cache: &ObjectCache,
    scope: Scope,
    file_name: &str,
    content_type: Option<&str>,
    bytes: &[u8],
) -> StoreResult<AttachmentRef> {
    let object_key = new_object_key();
    crate::log_info!(
        "files::store_file: '{}' ({} bytes) as {object_key}",
        file_name,
        bytes.len()
    );

    // Local first: the file is on this machine the moment the record is saved.
    cache
        .put(&object_key, scope, file_name, content_type, bytes)
        .await?;

    // Then Oracle, when it is configured. A failure is not fatal: the row stays
    // pending and `drain_pending` will send it on the next online moment.
    if let Some(config) = config {
        match upload_one(config, cache, &object_key, content_type, bytes).await {
            Ok(()) => crate::log_info!("files::store_file: {object_key} uploaded to Oracle"),
            Err(error) => crate::log_warn!(
                "files::store_file: {object_key} kept locally; upload deferred: {error}"
            ),
        }
    } else {
        crate::log_debug!("files::store_file: Oracle not configured — upload deferred");
    }

    Ok(AttachmentRef {
        file_name: file_name.to_string(),
        byte_size: bytes.len() as i64,
        content_type: content_type.map(str::to_string),
        object_key,
    })
}

/// The bytes for a reference: the local cache first, Oracle only when needed.
pub async fn fetch_bytes(
    config: Option<&ObjectStoreConfig>,
    cache: &ObjectCache,
    scope: Scope,
    object_key: &str,
    file_name: &str,
    content_type: Option<&str>,
) -> Result<Vec<u8>, FileError> {
    if let Some(bytes) = cache.get(object_key).await.map_err(|error| {
        FileError::Failed(error.to_string())
    })? {
        crate::log_debug!(
            "files::fetch_bytes: {object_key} ('{file_name}') served from the local cache"
        );
        return Ok(bytes);
    }

    let Some(config) = config else {
        crate::log_warn!("files::fetch_bytes: {object_key} not cached and Oracle is not configured");
        return Err(FileError::NotConfigured);
    };

    crate::log_info!("files::fetch_bytes: {object_key} not cached — fetching from Oracle");
    let client = config.client();
    let bytes = object_store::get(&client, &config.bucket, object_key)
        .await
        .map_err(|error| FileError::Offline(error.0))?;

    // Cache what was fetched, marked uploaded (it is definitionally in Oracle).
    if let Err(error) = cache
        .put(object_key, scope, file_name, content_type, &bytes)
        .await
    {
        crate::log_warn!("files::fetch_bytes: could not cache {object_key}: {error}");
    } else {
        let _ = cache.mark_uploaded(object_key).await;
    }

    Ok(bytes)
}

/// Send every cached-but-unsent file to Oracle. Called at startup, after a save
/// and — importantly — **before a Push**, so the store never publishes a
/// reference whose bytes are not yet in the cloud.
pub async fn drain_pending(config: Option<&ObjectStoreConfig>, cache: &ObjectCache) -> UploadReport {
    let Some(config) = config else {
        return UploadReport::default();
    };

    let pending = match cache.pending().await {
        Ok(pending) => pending,
        Err(error) => {
            crate::log_warn!("files::drain_pending: could not read the cache: {error}");
            return UploadReport::default();
        }
    };

    if pending.is_empty() {
        crate::log_debug!("files::drain_pending: nothing pending");
        return UploadReport::default();
    }

    crate::log_info!("files::drain_pending: sending {} file(s)", pending.len());
    let mut report = UploadReport::default();
    for item in pending {
        crate::log_debug!(
            "files::drain_pending: sending '{}' ({} bytes) as {}",
            item.file_name,
            item.byte_size,
            item.object_key
        );
        match upload_one(
            config,
            cache,
            &item.object_key,
            item.content_type.as_deref(),
            &item.bytes,
        )
        .await
        {
            Ok(()) => report.uploaded += 1,
            Err(error) => {
                report.failed += 1;
                crate::log_warn!(
                    "files::drain_pending: {} still pending: {error}",
                    item.object_key
                );
            }
        }
    }
    report.remaining = cache.count_pending().await.unwrap_or(0);
    crate::log_info!(
        "files::drain_pending: uploaded={} failed={} remaining={}",
        report.uploaded,
        report.failed,
        report.remaining
    );
    report
}

/// Remove a file's bytes: the local cache row, then the Oracle object
/// (best-effort — an object left behind when offline is harmless).
pub async fn remove_object(config: Option<&ObjectStoreConfig>, cache: &ObjectCache, object_key: &str) {
    if let Err(error) = cache.remove(object_key).await {
        crate::log_warn!("files::remove_object: could not drop cache row {object_key}: {error}");
    }
    if let Some(config) = config {
        let client = config.client();
        if let Err(error) = object_store::delete(&client, &config.bucket, object_key).await {
            crate::log_warn!("files::remove_object: Oracle delete of {object_key} failed: {error}");
        }
    }
}

async fn upload_one(
    config: &ObjectStoreConfig,
    cache: &ObjectCache,
    object_key: &str,
    content_type: Option<&str>,
    bytes: &[u8],
) -> Result<(), object_store::ObjectStoreError> {
    let client = config.client();
    object_store::put(&client, &config.bucket, object_key, content_type, bytes.to_vec()).await?;
    if let Err(error) = cache.mark_uploaded(object_key).await {
        crate::log_warn!("files::upload_one: could not flag {object_key} as uploaded: {error}");
    }
    Ok(())
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
