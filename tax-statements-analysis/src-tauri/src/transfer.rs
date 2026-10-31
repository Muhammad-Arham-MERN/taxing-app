// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Per-file transfer progress: the one place a file's byte-by-byte movement is
//! turned into something the frontend can draw a loader from.
//!
//! Both directions of a transfer — a `put` to Oracle and a `get` from it — call
//! a [`ProgressSink`] as each frame moves (`cloud/object_store.rs`). `files.rs`
//! builds that sink from a [`TransferReporter`], which emits one
//! `cloud://transfer` event per update. The event carries the file's **object
//! key** as its `id`: the store keeps that key as a statement's `fileRef` / a
//! record's `fileRef`, so the frontend matches the event to the exact table row
//! and shows the loader beside it (purple for an upload, green for a download).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

/// Emitted for every progress update of a file upload or download.
pub const TRANSFER_EVENT: &str = "cloud://transfer";

/// The fewest milliseconds between two progress events for the same file. The
/// first, the last and any failure are always emitted regardless, so a large
/// file cannot flood the event channel with hundreds of frames.
const THROTTLE_MS: u64 = 60;

/// Which way a file's bytes are moving. Chosen by the reporter, drawn by the
/// frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Upload,
    Download,
}

impl Direction {
    pub fn as_str(self) -> &'static str {
        match self {
            Direction::Upload => "upload",
            Direction::Download => "download",
        }
    }
}

/// One progress update, shaped for the frontend (`cloud://transfer` payload).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferEvent {
    /// The object key — equals the row's `fileRef`, so the loader finds its row.
    pub id: String,
    /// `"upload"` or `"download"`.
    pub direction: &'static str,
    pub file_name: String,
    pub transferred: u64,
    pub total: u64,
    /// True for the final event, whether it succeeded or failed.
    pub done: bool,
    /// Present only when the transfer failed.
    pub error: Option<String>,
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The handle a transfer uses to report progress.
///
/// Cheap to clone and the clones share their counters, so the sink handed to the
/// object store and the caller that finishes the transfer are the same reporter.
#[derive(Clone)]
pub struct TransferReporter {
    app: AppHandle,
    id: String,
    file_name: String,
    direction: Direction,
    /// The size, refined when it becomes known (a download learns it from the
    /// first response frame).
    total: Arc<AtomicU64>,
    /// The running count, kept for the final event a failure reports.
    sent: Arc<AtomicU64>,
    started_at: Instant,
    last_ms: Arc<AtomicU64>,
}

impl TransferReporter {
    pub fn new(
        app: &AppHandle,
        direction: Direction,
        id: &str,
        file_name: &str,
        total: u64,
    ) -> Self {
        TransferReporter {
            app: app.clone(),
            id: id.to_string(),
            file_name: file_name.to_string(),
            direction,
            total: Arc::new(AtomicU64::new(total)),
            sent: Arc::new(AtomicU64::new(0)),
            started_at: Instant::now(),
            last_ms: Arc::new(AtomicU64::new(0)),
        }
    }

    /// The transfer has begun: a zero-progress event, so the loader appears at
    /// once (with an indeterminate ring when the size is not yet known).
    pub fn started(&self) {
        self.emit(0, false, None);
    }

    /// A frame moved. `sent` is the running total; `total` may refine the size.
    /// Throttled so a large file cannot flood the event channel.
    pub fn advance(&self, sent: u64, total: u64) {
        if total > 0 {
            self.total.store(total, Ordering::Relaxed);
        }
        self.sent.store(sent, Ordering::Relaxed);

        let known = self.total.load(Ordering::Relaxed);
        let now = self.started_at.elapsed().as_millis() as u64;
        let last = self.last_ms.load(Ordering::Relaxed);
        if (known > 0 && sent >= known) || now.saturating_sub(last) >= THROTTLE_MS {
            self.last_ms.store(now, Ordering::Relaxed);
            self.emit(sent, false, None);
        }
    }

    /// The transfer finished successfully.
    pub fn finished(&self) {
        let total = self.total.load(Ordering::Relaxed);
        self.emit(total, true, None);
    }

    /// The transfer failed; the bytes stay where they were (still pending, or
    /// still unfetched) and the practitioner keeps the manual action.
    pub fn failed(&self, message: &str) {
        let sent = self.sent.load(Ordering::Relaxed);
        self.emit(sent, true, Some(message.to_string()));
    }

    fn emit(&self, transferred: u64, done: bool, error: Option<String>) {
        let payload = TransferEvent {
            id: self.id.clone(),
            direction: self.direction.as_str(),
            file_name: self.file_name.clone(),
            transferred,
            total: self.total.load(Ordering::Relaxed),
            done,
            error,
        };
        let _ = self.app.emit(TRANSFER_EVENT, payload);
    }
}

/// The callback the object store calls as bytes move: `(transferred, total)`.
/// Boxed and owned so it can be moved into the SDK's streaming request body.
pub type ProgressSink = Box<dyn Fn(u64, u64) + Send + Sync>;

/// Turn a reporter into a sink for the object store, sharing the reporter's
/// counters so the caller can still finish the transfer afterwards.
pub fn sink(reporter: &TransferReporter) -> ProgressSink {
    let reporter = reporter.clone();
    Box::new(move |sent, total| reporter.advance(sent, total))
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
