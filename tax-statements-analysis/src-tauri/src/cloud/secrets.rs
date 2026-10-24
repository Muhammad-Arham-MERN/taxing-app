// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The cloud secrets: parsing the partner's env file and holding the values in
//! **Windows Credential Manager** (research R4, FR-044–FR-049).
//!
//! The installer carries no secrets. On a machine that is not yet set up the
//! practitioner pastes the partner's env file; the values are parsed strictly,
//! checked against the required keys, and written one-per-key into the OS
//! credential store under a fixed service prefix. Nothing here ever writes a
//! secret to a file the application owns (FR-046).

use std::collections::BTreeMap;

/// The values the application needs to sync at all, in the order they are
/// reported. These match the partner's env file (`sync-poc.env.example`).
pub const REQUIRED_KEYS: [&str; 2] = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];

/// Optional values, needed only by the storage gauge (research R11). When they
/// are absent the gauge reads *unavailable* (FR-031); the sync itself does not
/// need them.
pub const OPTIONAL_KEYS: [&str; 3] = ["TURSO_ORG", "TURSO_DATABASE", "TURSO_PLATFORM_TOKEN"];

/// The Oracle Object Storage values (the file-bytes module). The same partner
/// env file carries them next to the Turso ones. They are needed only by the
/// file features: when they are absent, files cannot be sent to or fetched from
/// the cloud, but the application still runs and syncs text records.
pub const STORAGE_KEYS: [&str; 5] = [
    "OCI_S3_ENDPOINT",
    "OCI_S3_REGION",
    "OCI_S3_BUCKET",
    "OCI_S3_ACCESS_KEY_ID",
    "OCI_S3_SECRET_ACCESS_KEY",
];

/// The fixed service prefix under which each value is stored, so the entries are
/// recognisably ours in Windows Credential Manager.
const SERVICE_PREFIX: &str = "tax-statements-analysis";

/// Everything needed to reach the central copy, report its storage, and reach
/// the Oracle Object Storage bucket the file bytes live in.
#[derive(Debug, Clone)]
pub struct Secrets {
    pub database_url: String,
    pub auth_token: String,
    pub org: Option<String>,
    pub database: Option<String>,
    pub platform_token: Option<String>,
    /// Present only when all five `OCI_S3_*` values are in the credential store.
    pub object_storage: Option<super::object_store::ObjectStoreConfig>,
}

/// A parse of the pasted env file. `malformed` is set when a non-comment,
/// non-blank line is not `KEY=VALUE`, so the paste can be rejected with a
/// specific message rather than silently half-saved (FR-048).
#[derive(Debug, Default)]
pub struct ParsedEnv {
    pub values: BTreeMap<String, String>,
    pub missing: Vec<String>,
    pub malformed: Option<String>,
}

/// Parse the env file **strictly**: `KEY=VALUE` per line; blank lines and `#`
/// comments are ignored; surrounding quotes are stripped. The required keys are
/// checked and any that are absent (or blank) are named.
pub fn parse(text: &str) -> ParsedEnv {
    let mut parsed = ParsedEnv::default();

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            if parsed.malformed.is_none() {
                parsed.malformed = Some(format!("\"{line}\" is not in KEY=VALUE form."));
            }
            continue;
        };
        let key = key.trim().to_string();
        let value = unquote(value.trim());
        if REQUIRED_KEYS.contains(&key.as_str())
            || OPTIONAL_KEYS.contains(&key.as_str())
            || STORAGE_KEYS.contains(&key.as_str())
        {
            parsed.values.insert(key, value);
        }
    }

    parsed.missing = REQUIRED_KEYS
        .iter()
        .filter(|key| parsed.values.get(**key).map(|v| v.trim().is_empty()).unwrap_or(true))
        .map(|key| key.to_string())
        .collect();

    crate::log_info!(
        "secrets::parse: {} value(s) read, missing={:?}, malformed={:?}",
        parsed.values.len(),
        parsed.missing,
        parsed.malformed
    );
    parsed
}

fn unquote(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return value[1..value.len() - 1].to_string();
        }
    }
    value.to_string()
}

/// Why the credential store could not be used. The message is shown to the
/// practitioner; the setup gate keeps them in onboarding until it works.
#[derive(Debug)]
pub struct SecretsError(pub String);

impl std::fmt::Display for SecretsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<std::io::Error> for SecretsError {
    fn from(error: std::io::Error) -> Self {
        SecretsError(error.to_string())
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Read the two required values back from Windows Credential Manager.
///
/// `Ok(None)` means the store holds no complete set (not set up); `Ok(Some)`
/// means both required values were found (the optional gauge values may still be
/// absent); `Err` means the credential store itself could not be read, which is
/// reported rather than silently treated as "not set up"
/// (contracts/tauri-commands.md §3).
pub fn read() -> Result<Option<Secrets>, SecretsError> {
    let mut required = BTreeMap::new();
    for key in REQUIRED_KEYS {
        match platform::read_value(key)? {
            Some(value) if !value.trim().is_empty() => {
                required.insert(key, value);
            }
            _ => {
                crate::log_debug!("secrets::read: {key} is absent or empty — not set up here");
                return Ok(None);
            }
        }
    }

    let optional = |key: &str| -> Result<Option<String>, SecretsError> {
        Ok(platform::read_value(key)?.filter(|value| !value.trim().is_empty()))
    };

    let object_storage = match (
        optional("OCI_S3_ENDPOINT")?,
        optional("OCI_S3_REGION")?,
        optional("OCI_S3_BUCKET")?,
        optional("OCI_S3_ACCESS_KEY_ID")?,
        optional("OCI_S3_SECRET_ACCESS_KEY")?,
    ) {
        (Some(endpoint), Some(region), Some(bucket), Some(access_key_id), Some(secret_access_key)) => {
            Some(super::object_store::ObjectStoreConfig {
                endpoint,
                region,
                bucket,
                access_key_id,
                secret_access_key,
            })
        }
        _ => None,
    };

    let secrets = Secrets {
        database_url: required.remove("TURSO_DATABASE_URL").unwrap_or_default(),
        auth_token: required.remove("TURSO_AUTH_TOKEN").unwrap_or_default(),
        org: optional("TURSO_ORG")?,
        database: optional("TURSO_DATABASE")?,
        platform_token: optional("TURSO_PLATFORM_TOKEN")?,
        object_storage,
    };
    crate::log_debug!(
        "secrets::read: ready (gauge values present: org={}, database={}, platform_token={}; \
         object storage configured: {})",
        secrets.org.is_some(),
        secrets.database.is_some(),
        secrets.platform_token.is_some(),
        secrets.object_storage.is_some()
    );
    Ok(Some(secrets))
}

/// Write the parsed values into Windows Credential Manager, one per key. A
/// second call replaces the stored values (FR-049).
pub fn store(values: &BTreeMap<String, String>) -> Result<(), SecretsError> {
    crate::log_info!(
        "secrets::store: writing {} value(s) to the credential store: {:?}",
        values.len(),
        values.keys().collect::<Vec<_>>()
    );
    for (key, value) in values {
        platform::write_value(key, value)?;
    }
    crate::log_info!("secrets::store: saved");
    Ok(())
}

/// Remove every stored value.
pub fn clear() -> Result<(), SecretsError> {
    crate::log_info!("secrets::clear: removing every stored value");
    for key in REQUIRED_KEYS
        .iter()
        .chain(OPTIONAL_KEYS.iter())
        .chain(STORAGE_KEYS.iter())
    {
        platform::delete_value(key)?;
    }
    crate::log_info!("secrets::clear: cleared");
    Ok(())
}

/// The name a value is stored under, e.g. `tax-statements-analysis/TURSO_AUTH_TOKEN`.
fn target_name(key: &str) -> String {
    format!("{SERVICE_PREFIX}/{key}")
}

// ── Windows Credential Manager (generic credentials) ─────────────────────────

#[cfg(windows)]
mod platform {
    use super::{target_name, SecretsError};
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn last_error() -> u32 {
        unsafe { GetLastError() }
    }

    /// Not found is a normal answer ("the secrets are not set up here"), not a
    /// failure. Any other error means the credential store is unavailable.
    pub fn read_value(key: &str) -> Result<Option<String>, SecretsError> {
        let target = wide(&target_name(key));
        let mut pointer: *mut CREDENTIALW = std::ptr::null_mut();
        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut pointer) };
        if ok == 0 {
            let code = last_error();
            if code == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err(SecretsError(format!(
                "Windows Credential Manager could not be read (error {code})."
            )));
        }

        let value = unsafe {
            let credential = &*pointer;
            let bytes = std::slice::from_raw_parts(
                credential.CredentialBlob,
                credential.CredentialBlobSize as usize,
            );
            String::from_utf8_lossy(bytes).to_string()
        };
        unsafe { CredFree(pointer as *const core::ffi::c_void) };
        Ok(Some(value))
    }

    pub fn write_value(key: &str, value: &str) -> Result<(), SecretsError> {
        let mut target = wide(&target_name(key));
        let mut blob = value.as_bytes().to_vec();
        let mut credential = CREDENTIALW {
            TargetName: target.as_mut_ptr(),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..Default::default()
        };
        credential.Type = CRED_TYPE_GENERIC;
        credential.Comment = std::ptr::null_mut();
        credential.UserName = std::ptr::null_mut();

        let ok = unsafe { CredWriteW(&credential, 0) };
        if ok == 0 {
            return Err(SecretsError(format!(
                "Windows Credential Manager could not be written (error {}).",
                last_error()
            )));
        }
        Ok(())
    }

    pub fn delete_value(key: &str) -> Result<(), SecretsError> {
        let target = wide(&target_name(key));
        let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let code = last_error();
            if code != ERROR_NOT_FOUND {
                return Err(SecretsError(format!(
                    "Windows Credential Manager could not be updated (error {code})."
                )));
            }
        }
        Ok(())
    }
}

/// The application ships for Windows. Anywhere else the credential store is not
/// available, which is reported rather than faked (FR-046).
#[cfg(not(windows))]
mod platform {
    use super::{target_name, SecretsError};

    fn unsupported() -> SecretsError {
        SecretsError(
            "The secure credential store is only available on Windows.".to_string(),
        )
    }

    pub fn read_value(_key: &str) -> Result<Option<String>, SecretsError> {
        Err(unsupported())
    }

    pub fn write_value(_key: &str, _value: &str) -> Result<(), SecretsError> {
        Err(unsupported())
    }

    pub fn delete_value(_key: &str) -> Result<(), SecretsError> {
        Err(unsupported())
    }

    #[allow(dead_code)]
    fn _keep_target_name(_key: &str) -> String {
        target_name(_key)
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
