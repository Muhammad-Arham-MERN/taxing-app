// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! One classifier that turns a sync attempt into a single plain-language
//! outcome. Every command reports through here, so the practitioner always sees
//! exactly one line per attempt (research R7, FR-033).

use serde::Serialize;

/// The outcome taxonomy (research R7). `NothingNew` is kept distinct so a no-op
/// is never mistaken for a failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncOutcomeKind {
    Success,
    NothingNew,
    NoInternet,
    SecretsUnavailable,
    ServerUnavailable,
    Other,
}

/// The one plain-language result of a Push or Sync (FR-033).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub kind: SyncOutcomeKind,
    pub message: String,
    /// The underlying detail, shown for the "other" case (research R7).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl SyncOutcome {
    pub fn success(message: impl Into<String>) -> Self {
        SyncOutcome {
            kind: SyncOutcomeKind::Success,
            message: message.into(),
            reason: None,
        }
    }

    pub fn nothing_new() -> Self {
        SyncOutcome {
            kind: SyncOutcomeKind::NothingNew,
            message: "There was nothing new to exchange.".to_string(),
            reason: None,
        }
    }

    pub fn no_internet(reason: impl Into<String>) -> Self {
        SyncOutcome {
            kind: SyncOutcomeKind::NoInternet,
            message: "The internet could not be reached, so nothing was exchanged. Your work is \
                      safe and will publish when the connection is back."
                .to_string(),
            reason: Some(reason.into()),
        }
    }

    pub fn secrets_unavailable() -> Self {
        SyncOutcome {
            kind: SyncOutcomeKind::SecretsUnavailable,
            message: "The cloud connection details are not set up on this computer yet.".to_string(),
            reason: None,
        }
    }

    pub fn server_unavailable(reason: impl Into<String>) -> Self {
        SyncOutcome {
            kind: SyncOutcomeKind::ServerUnavailable,
            message: "The cloud could not be reached or refused the request. Nothing was lost."
                .to_string(),
            reason: Some(reason.into()),
        }
    }

    pub fn other(reason: impl Into<String>) -> Self {
        let reason = reason.into();
        SyncOutcome {
            kind: SyncOutcomeKind::Other,
            message: "The exchange did not finish. Nothing was lost.".to_string(),
            reason: Some(reason),
        }
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Classify an engine failure into one outcome.
///
/// The Turso sync engine reports through a single string-carrying error kind, so
/// this classifies by the message it carries — the network faults, the server /
/// auth rejections, and everything else (research R7).
pub fn classify(error: &turso::Error) -> SyncOutcome {
    let raw = error.to_string();
    // The engine writes an HTTP status as `status=404` (an equals sign), so the
    // `=` is folded to a space here; the needles below then match whether the
    // engine uses a space or an equals sign.
    let lower = raw.to_lowercase().replace('=', " ");

    const SERVER: [&str; 13] = [
        "unauthorized",
        "forbidden",
        "invalid token",
        "auth role not found",
        "status 400",
        "status 401",
        "status 403",
        "status 404",
        "status 500",
        "status 502",
        "status 503",
        "status 504",
        "remote_url is not available",
    ];
    const NETWORK: [&str; 9] = [
        "http request failed",
        "dns",
        "failed to lookup",
        "connection refused",
        "timed out",
        "timeout",
        "no route",
        "network",
        "unreachable",
    ];

    // A response that carries an HTTP status came *from* the server, so it is a
    // server-side answer even when its wording sounds like a network fault — e.g.
    // "no route configured for host …" with status 502. Checked first for that
    // reason.
    if SERVER.iter().any(|needle| lower.contains(needle)) {
        crate::log_warn!("outcome::classify: server/auth rejection — {raw}");
        return SyncOutcome::server_unavailable(raw);
    }

    if NETWORK.iter().any(|needle| lower.contains(needle)) {
        crate::log_warn!("outcome::classify: network failure — {raw}");
        return SyncOutcome::no_internet(raw);
    }

    crate::log_warn!("outcome::classify: unclassified failure — {raw}");
    SyncOutcome::other(raw)
}
