// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The Turso Cloud **Usage API** client behind the header's storage gauge
//! (research R11, FR-029–FR-032).
//!
//! `GET /v1/organizations/{org}/databases/{database}/usage` with the platform
//! token. `database.total.storage_bytes` is the storage in use; remaining is the
//! allowance constant minus that. When anything is missing or the API fails the
//! result is `None`, so the gauge shows *unavailable* rather than a stale number
//! (FR-031).

use super::config::{self, Config};
use serde::Serialize;

/// Storage headroom for the header gauge (data-model §3).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUsage {
    pub used_bytes: i64,
    pub allowance_bytes: i64,
    pub remaining_bytes: i64,
}

/// Fetch the storage figure, or `None` when it cannot be retrieved.
pub async fn fetch(config: &Config) -> Option<CloudUsage> {
    // The gauge needs all three Usage-API values. They are optional in the
    // partner's env file, so when they are absent the gauge reads *unavailable*
    // rather than showing a wrong number (FR-031).
    let (Some(org), Some(database), Some(platform_token)) = (
        config.org.as_deref(),
        config.database.as_deref(),
        config.platform_token.as_deref(),
    ) else {
        crate::log_debug!("usage::fetch: the gauge values are not set — reporting unavailable");
        return None;
    };

    let url =
        format!("https://api.turso.tech/v1/organizations/{org}/databases/{database}/usage");
    crate::log_info!("usage::fetch: GET {url}");

    let client = reqwest::Client::new();
    let response = match client.get(&url).bearer_auth(platform_token).send().await {
        Ok(response) => response,
        Err(error) => {
            crate::log_warn!("usage::fetch: the request failed: {error}");
            return None;
        }
    };

    let status = response.status();
    if !status.is_success() {
        crate::log_warn!("usage::fetch: the API answered {status}");
        return None;
    }

    let body: serde_json::Value = match response.json().await {
        Ok(body) => body,
        Err(error) => {
            crate::log_warn!("usage::fetch: the response body could not be read: {error}");
            return None;
        }
    };
    // The figure lives at `total.storage_bytes`; the same number is repeated
    // under `database.usage` (and `database.total` on some responses), so any of
    // the shapes is accepted rather than pinning one (research R11).
    let Some(used) = body
        .get("total")
        .and_then(|total| total.get("storage_bytes"))
        .or_else(|| {
            body.get("database")
                .and_then(|database| database.get("usage"))
                .and_then(|usage| usage.get("storage_bytes"))
        })
        .or_else(|| {
            body.get("database")
                .and_then(|database| database.get("total"))
                .and_then(|total| total.get("storage_bytes"))
        })
        .and_then(|bytes| bytes.as_i64())
    else {
        crate::log_warn!("usage::fetch: the response carried no storage_bytes figure");
        return None;
    };

    let allowance = config::ALLOWANCE_BYTES;
    crate::log_info!("usage::fetch: {used} of {allowance} bytes used");
    Some(CloudUsage {
        used_bytes: used,
        allowance_bytes: allowance,
        remaining_bytes: (allowance - used).max(0),
    })
}
