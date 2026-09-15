// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Remembering where the practitioner keeps their records.
//!
//! `settings.json` in the application config directory is the **only** thing this
//! module keeps outside the store file, and it has to be readable before the
//! store is open — which is why it is a plain file rather than a plugin store
//! (research R8).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The file the store lives in when the practitioner chooses a folder.
pub const STORE_FILE_NAME: &str = "tax-statements.sqlite";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LocationKind {
    /// A folder the practitioner chose; the store file is created inside it.
    Directory,
    /// A store file they already held, adopted in place (FR-062).
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLocation {
    pub kind: LocationKind,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsFile {
    storage_location: Option<StorageLocation>,
}

/// Why a remembered location cannot be used. Rendered as a state rather than an
/// error, because the frontend offers a re-choice instead of failing (FR-023,
/// FR-025, FR-056).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StorageProblem {
    Unreachable,
    NotAStore,
    Damaged,
    Unwritable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageState {
    pub chosen: bool,
    pub location: Option<StorageLocation>,
    pub problem: Option<StorageProblem>,
}

impl StorageState {
    pub fn none() -> Self {
        StorageState {
            chosen: false,
            location: None,
            problem: None,
        }
    }
}

fn settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("The application folder could not be located: {error}"))?;
    Ok(dir.join("settings.json"))
}

pub fn read_location(app: &AppHandle) -> Option<StorageLocation> {
    let path = settings_file(app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    let parsed: SettingsFile = serde_json::from_str(&raw).ok()?;
    parsed.storage_location
}

pub fn write_location(app: &AppHandle, location: &StorageLocation) -> Result<(), String> {
    let path = settings_file(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("The application folder could not be created: {error}"))?;
    }
    let payload = SettingsFile {
        storage_location: Some(location.clone()),
    };
    let raw = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("The setting could not be prepared: {error}"))?;
    std::fs::write(&path, raw)
        .map_err(|error| format!("The setting could not be saved: {error}"))
}

/// The file a location refers to. A chosen folder gets the store created inside
/// it; a chosen file is used as it stands (FR-016, FR-062).
pub fn store_file_path(location: &StorageLocation) -> PathBuf {
    match location.kind {
        LocationKind::Directory => Path::new(&location.path).join(STORE_FILE_NAME),
        LocationKind::File => PathBuf::from(&location.path),
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
