// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! One serialisable error shape for the whole command surface, so the frontend
//! maps failures to meaning instead of parsing strings
//! (`contracts/tauri-commands.md` §4).

use crate::settings::StorageProblem;
use crate::store::StoreError;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    Validation,
    // There is deliberately no `DuplicateSubmission` here. The backend has no way
    // to tell a rapid double-click from two genuine entries, and Module 1's
    // in-flight guard in the form already prevents the double submission that
    // FR-007 is about.
    InvalidRange,
    NoStorageLocation,
    LocationUnreachable,
    StoreDamaged,
    NotAStore,
    LocationUnwritable,
    StoreWriteFailed,
    UnknownStatement,
    UnknownBill,
    AttachmentMissing,
    AttachmentWriteFailed,
    AttachmentOpenFailed,
    CarryAcrossInterrupted,
    Io,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<BTreeMap<String, String>>,
    /// Statements copied before a carry-across stopped, when that is why it failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copied: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining: Option<u64>,
}

impl CommandError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        CommandError {
            kind,
            message: message.into(),
            fields: None,
            copied: None,
            remaining: None,
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        CommandError::new(ErrorKind::Io, message)
    }

    pub fn no_storage_location() -> Self {
        CommandError::new(
            ErrorKind::NoStorageLocation,
            "Choose where your records should be kept before recording anything.",
        )
    }

    pub fn validation(fields: BTreeMap<String, String>) -> Self {
        CommandError::validation_for("statement", fields)
    }

    /// The same, named for whichever record kind was being saved. Module 3 uses
    /// it for bills so the practitioner is told which form is at fault.
    pub fn validation_for(subject: &str, fields: BTreeMap<String, String>) -> Self {
        CommandError {
            kind: ErrorKind::Validation,
            message: format!("The {subject} could not be saved because some fields are not valid."),
            fields: Some(fields),
            copied: None,
            remaining: None,
        }
    }

    pub fn carry_interrupted(copied: u64, remaining: u64, message: impl Into<String>) -> Self {
        CommandError {
            kind: ErrorKind::CarryAcrossInterrupted,
            message: message.into(),
            fields: None,
            copied: Some(copied),
            remaining: Some(remaining),
        }
    }

    pub fn from_storage_problem(problem: StorageProblem) -> Self {
        match problem {
            StorageProblem::Unreachable => CommandError::new(
                ErrorKind::LocationUnreachable,
                "The folder holding your records cannot be reached. It may have been moved, \
                 renamed, or be on a drive that is not connected.",
            ),
            StorageProblem::NotAStore => CommandError::new(
                ErrorKind::NotAStore,
                "That file is not one of this application's records files.",
            ),
            StorageProblem::Damaged => CommandError::new(
                ErrorKind::StoreDamaged,
                "Your records file cannot be opened because it is damaged. It has been left \
                 exactly as it is.",
            ),
            StorageProblem::Unwritable => CommandError::new(
                ErrorKind::LocationUnwritable,
                "That folder cannot be written to.",
            ),
        }
    }
}

impl From<StoreError> for CommandError {
    fn from(error: StoreError) -> Self {
        let message = error.to_string();
        let kind = match &error {
            StoreError::InvalidRange => ErrorKind::InvalidRange,
            StoreError::Unreachable => ErrorKind::LocationUnreachable,
            StoreError::NotAStore(_) => ErrorKind::NotAStore,
            StoreError::Damaged => ErrorKind::StoreDamaged,
            StoreError::Unwritable(_) => ErrorKind::LocationUnwritable,
            StoreError::UnknownStatement => ErrorKind::UnknownStatement,
            StoreError::UnknownBill => ErrorKind::UnknownBill,
            StoreError::NoAttachment => ErrorKind::AttachmentMissing,
            StoreError::Sqlite(_) | StoreError::Io(_) => ErrorKind::StoreWriteFailed,
        };
        CommandError::new(kind, message)
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
