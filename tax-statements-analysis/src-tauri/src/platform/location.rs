// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! Best-effort classification of a chosen folder (FR-055).
//!
//! **This is a heuristic, and it is treated as one.** `GetDriveTypeW` reports what
//! the volume manager believes, not where the bytes physically live — many USB
//! drives and external SSDs report as fixed disks — and the dependable signal for
//! a cloud-synced folder is the Cloud Files API, which is not used here. The
//! outcome of a wrong answer is a missing *warning*, never a refusal, which is
//! why that trade-off is acceptable (research R9).

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LocationRisk {
    /// Under a folder synced by a cloud provider.
    CloudSynced,
    /// On a network share or a mapped network drive.
    Network,
    /// On removable media.
    Removable,
}

/// Folder names used by common sync clients. A heuristic: it can miss a provider
/// and it can be defeated by renaming a folder.
const SYNC_FOLDER_NAMES: [&str; 6] = [
    "onedrive",
    "dropbox",
    "google drive",
    "googledrive",
    "sharepoint",
    "icloud drive",
];

/// Environment variables that point at a sync folder.
const SYNC_ENV_VARS: [&str; 3] = ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"];

pub fn classify(path: &Path) -> Option<LocationRisk> {
    if is_inside_synced_folder(path) {
        return Some(LocationRisk::CloudSynced);
    }

    match drive_type(path)? {
        DRIVE_REMOVABLE => Some(LocationRisk::Removable),
        DRIVE_REMOTE => Some(LocationRisk::Network),
        _ => None,
    }
}

fn is_inside_synced_folder(path: &Path) -> bool {
    if SYNC_ENV_VARS
        .iter()
        .filter_map(|name| std::env::var_os(name))
        .any(|value| path.starts_with(Path::new(&value)))
    {
        return true;
    }

    path.components().any(|component| {
        let text = component.as_os_str().to_string_lossy().to_lowercase();
        SYNC_FOLDER_NAMES.contains(&text.as_str())
    })
}

// Drive type constants, named here so the meaning is clear at the call site.
#[cfg(windows)]
const DRIVE_REMOVABLE: u32 = 2;
#[cfg(windows)]
const DRIVE_REMOTE: u32 = 4;

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Resolve the path to its volume root first, then ask what kind of drive that
/// root is. Resolving first is what catches a share reached through a mapped
/// drive letter or a mounted folder, which the path alone does not reveal.
#[cfg(windows)]
fn drive_type(path: &Path) -> Option<u32> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{GetDriveTypeW, GetVolumePathNameW};

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut root = vec![0u16; 512];
    let resolved = unsafe {
        GetVolumePathNameW(wide.as_ptr(), root.as_mut_ptr(), root.len() as u32)
    };
    if resolved == 0 {
        return None;
    }

    Some(unsafe { GetDriveTypeW(root.as_ptr()) })
}

#[cfg(not(windows))]
fn drive_type(_path: &Path) -> Option<u32> {
    None
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
