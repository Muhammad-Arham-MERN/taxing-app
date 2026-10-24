// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Backend logging: timestamped, levelled lines on **stderr**, so a development
//! run shows what the backend is doing as it happens.
//!
//! Every line carries a level, the calling module, and the message, e.g.
//!
//! ```text
//! [12:04:31.882]  INFO [statements] -> create_statement amount=500
//! [12:04:31.905]  INFO [statements] <- create_statement OK
//! ```
//!
//! The macros (`log_info!`, `log_warn!`, `log_error!`, `log_debug!`) are exported
//! at the crate root, so any module calls them as `crate::log_info!(...)` with no
//! import. They write to stderr, which is the stream `cargo tauri dev` shows in
//! the terminal. Nothing is written to a file.

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether emission is switched on. On by default; kept as a flag so a caller
/// could quieten a run without a rebuild if that is ever wanted.
static ENABLED: AtomicBool = AtomicBool::new(true);

#[derive(Clone, Copy, Debug)]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

impl Level {
    fn label(self) -> &'static str {
        match self {
            Level::Debug => "DEBUG",
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }
}

pub fn is_enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Emit one line. Called by the macros; `module` is filled in by `module_path!()`
/// at the call site, so each line names where it came from.
pub fn emit(level: Level, module: &str, args: std::fmt::Arguments<'_>) {
    if !is_enabled() {
        return;
    }
    let short = module.rsplit("::").next().unwrap_or(module);
    eprintln!("[{}] {:>5} [{}] {}", clock(), level.label(), short, args);
}

/// A visible divider, for marking a new phase of a run.
pub fn banner(label: &str) {
    if !is_enabled() {
        return;
    }
    eprintln!("──────────────────── {label} ────────────────────");
}

/// The wall-clock time as `HH:MM:SS.mmm` (UTC), without pulling in a date crate.
fn clock() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let seconds_of_day = secs % 86_400;
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        seconds_of_day / 3_600,
        (seconds_of_day % 3_600) / 60,
        seconds_of_day % 60,
        millis
    )
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        $crate::logging::emit($crate::logging::Level::Debug, module_path!(), format_args!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        $crate::logging::emit($crate::logging::Level::Info, module_path!(), format_args!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        $crate::logging::emit($crate::logging::Level::Warn, module_path!(), format_args!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        $crate::logging::emit($crate::logging::Level::Error, module_path!(), format_args!($($arg)*))
    };
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
