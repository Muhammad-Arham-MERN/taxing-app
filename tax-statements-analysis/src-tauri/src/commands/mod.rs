// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The IPC surface: a thin translation layer from commands to `store`/`cloud`,
//! kept thin on purpose so that the part of the system with no automated tests is
//! as small as possible (plan.md → Constitution Check).

pub mod attachments;
pub mod bills;
pub mod categories;
pub mod client_records;
pub mod clients;
pub mod cloud;
pub mod error;
pub mod onboarding;
pub mod statements;
pub mod storage;

use error::CommandError;

/// Log a command's outcome, so every request has a matching completion line and
/// every failure names its error kind and message. Each command logs its own
/// `-> name …` line on entry and calls this on the way out.
pub fn log_outcome<T>(command: &str, result: &Result<T, CommandError>) {
    match result {
        Ok(_) => crate::log_info!("<- {command} OK"),
        Err(error) => {
            crate::log_error!("<- {command} FAILED [{:?}] {}", error.kind, error.message)
        }
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
