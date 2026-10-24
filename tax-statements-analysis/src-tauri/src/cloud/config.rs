// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The cloud configuration: the values read on demand from Windows Credential
//! Manager, plus the storage allowance constant (research R4, R11).

use super::secrets;

/// The client's free-tier Turso allowance, in bytes: **5 GB**. Kept as one named
/// constant so it can be adjusted in a single place (research R11).
pub const ALLOWANCE_BYTES: i64 = 5 * 1024 * 1024 * 1024;

/// The Oracle Object Storage allowance, in bytes: **10 GB**, reported by the
/// header's file gauge. Kept as one named constant so it can be adjusted here.
pub const OBJECT_ALLOWANCE_BYTES: i64 = 10 * 1024 * 1024 * 1024;

/// The values the application needs to sync (the two the partner's env file
/// carries) plus the optional ones the storage gauge uses when present, plus the
/// Oracle Object Storage values the file-bytes module uses when present.
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub auth_token: String,
    pub org: Option<String>,
    pub database: Option<String>,
    pub platform_token: Option<String>,
    /// Present only when the five `OCI_S3_*` values are in the credential store.
    pub object_storage: Option<super::object_store::ObjectStoreConfig>,
}

impl Config {
    pub fn url(&self) -> &str {
        &self.database_url
    }

    pub fn token(&self) -> &str {
        &self.auth_token
    }
}

impl From<secrets::Secrets> for Config {
    fn from(secrets: secrets::Secrets) -> Self {
        Config {
            database_url: secrets.database_url,
            auth_token: secrets.auth_token,
            org: secrets.org,
            database: secrets.database,
            platform_token: secrets.platform_token,
            object_storage: secrets.object_storage,
        }
    }
}

/// Read the configuration from the credential store, or `None` when it is not
/// set up (or the store cannot be read). The process environment is never
/// consulted (research R4).
pub fn load() -> Option<Config> {
    match secrets::read() {
        Ok(Some(values)) => {
            crate::log_debug!("config::load: the cloud secrets are present");
            Some(Config::from(values))
        }
        Ok(None) => {
            crate::log_debug!("config::load: the cloud secrets are not set up on this machine");
            None
        }
        Err(error) => {
            crate::log_warn!("config::load: the credential store could not be read: {error}");
            None
        }
    }
}

/// Whether all five values are present. The setup gate reads this.
pub fn is_configured() -> bool {
    let configured = load().is_some();
    crate::log_debug!("config::is_configured = {configured}");
    configured
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
