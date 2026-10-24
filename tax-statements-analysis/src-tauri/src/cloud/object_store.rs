// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The **object store**: where a file's bytes live once they leave the store.
//!
//! Oracle Cloud (OCI) Object Storage speaks the Amazon S3 API, so the official
//! AWS SDK for Rust talks to it directly. The endpoint is a **path-style** OCI
//! compatibility endpoint (`https://<namespace>.compat.objectstorage.<region>.
//! oraclecloud.com`) and `force_path_style(true)` is what makes the SDK address
//! `…/n/<namespace>/b/<bucket>/o/<key>` rather than using a virtual host.
//!
//! Nothing here consults the process environment: the five values come from
//! Windows Credential Manager through `cloud::config` (the same rule the Turso
//! secrets follow), and they are handed to the SDK explicitly as a
//! `Credentials` provider. The SDK's default TLS is rustls with the
//! `aws-lc-rs` provider, the one `lib.rs` already installs at startup.

use aws_sdk_s3::config::{
    BehaviorVersion, Builder as S3ConfigBuilder, Credentials, Region,
    RequestChecksumCalculation, ResponseChecksumValidation,
};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;

/// The object-key prefix every uploaded file sits under. Kept as one constant so
/// the layout is described in exactly one place.
pub const KEY_PREFIX: &str = "objects";

/// Everything needed to reach one OCI bucket. Present only when all five values
/// are in the credential store (`cloud::secrets`).
#[derive(Debug, Clone)]
pub struct ObjectStoreConfig {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

/// Why an object-store call failed. The message is shown to the practitioner
/// where it is actionable; the underlying detail is logged.
#[derive(Debug)]
pub struct ObjectStoreError(pub String);

impl std::fmt::Display for ObjectStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// Build the S3 client for this OCI bucket.
///
/// `request_checksum_calculation(WhenRequired)` is deliberate: from SDK
/// behaviour version 2023-11-09 onward every `PutObject` carries an
/// `x-amz-checksum-*` trailer by default, which OCI's S3 compatibility layer
/// rejects. Restricting checksums to when they are strictly required keeps the
/// requests interoperable.
impl ObjectStoreConfig {
    pub fn client(&self) -> Client {
        crate::log_debug!(
            "object_store::client: endpoint={} region={} bucket={} (path-style)",
            self.endpoint,
            self.region,
            self.bucket
        );
        let credentials = Credentials::new(
            self.access_key_id.clone(),
            self.secret_access_key.clone(),
            None,
            None,
            "tax-statements-oci",
        );
        let config = S3ConfigBuilder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(self.region.clone()))
            .endpoint_url(self.endpoint.clone())
            .credentials_provider(credentials)
            // OCI serves buckets path-style; virtual-host addressing would
            // resolve `<bucket>.<endpoint>`, which does not exist there.
            .force_path_style(true)
            .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
            .response_checksum_validation(ResponseChecksumValidation::WhenRequired)
            .build();
        Client::from_conf(config)
    }
}

/// Upload one object, replacing any object already at that key.
pub async fn put(
    client: &Client,
    bucket: &str,
    key: &str,
    content_type: Option<&str>,
    bytes: Vec<u8>,
) -> Result<(), ObjectStoreError> {
    let size = bytes.len();
    crate::log_info!("object_store::put: {key} ({size} bytes) -> {bucket}");
    let mut request = client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(ByteStream::from(bytes));
    if let Some(content_type) = content_type {
        request = request.content_type(content_type);
    }
    request
        .send()
        .await
        .map_err(|error| {
            crate::log_error!("object_store::put: {key} failed: {error}");
            ObjectStoreError(format!("The file could not be uploaded: {error}"))
        })?;
    crate::log_info!("object_store::put: {key} uploaded");
    Ok(())
}

/// Download one object's whole contents.
pub async fn get(client: &Client, bucket: &str, key: &str) -> Result<Vec<u8>, ObjectStoreError> {
    crate::log_info!("object_store::get: {key} <- {bucket}");
    let response = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            crate::log_error!("object_store::get: {key} failed: {error}");
            ObjectStoreError(format!("The file could not be downloaded: {error}"))
        })?;
    let bytes = response
        .body
        .collect()
        .await
        .map_err(|error| {
            crate::log_error!("object_store::get: {key} body failed: {error}");
            ObjectStoreError(format!("The file could not be downloaded: {error}"))
        })?
        .into_bytes()
        .to_vec();
    crate::log_info!("object_store::get: {key} ({} bytes)", bytes.len());
    Ok(bytes)
}

/// Remove one object. A missing object is treated as success, so a repeated
/// delete (or an object already gone) never reports a failure.
pub async fn delete(client: &Client, bucket: &str, key: &str) -> Result<(), ObjectStoreError> {
    crate::log_info!("object_store::delete: {key} <- {bucket}");
    client
        .delete_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            crate::log_warn!("object_store::delete: {key} failed: {error}");
            ObjectStoreError(format!("The stored file could not be removed: {error}"))
        })?;
    Ok(())
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
/// The total bytes held in the bucket, summed over every object.
///
/// `ListObjectsV2` is paginated (1 000 keys per page); this walks every page and
/// adds each object's `Size`. It is what feeds the header's Oracle storage gauge
/// without needing OCI's RSA-signed metrics API (which the S3 customer secret
/// key cannot sign).
pub async fn bucket_usage(client: &Client, bucket: &str) -> Result<i64, ObjectStoreError> {
    crate::log_info!("object_store::bucket_usage: summing objects in {bucket}");
    let mut total: i64 = 0;
    let mut pages: u32 = 0;
    let mut token: Option<String> = None;

    loop {
        let mut request = client.list_objects_v2().bucket(bucket);
        if let Some(token) = token.clone() {
            request = request.continuation_token(token);
        }
        let response = request.send().await.map_err(|error| {
            crate::log_warn!("object_store::bucket_usage: listing failed: {error}");
            ObjectStoreError(format!("The stored-files figure could not be read: {error}"))
        })?;

        for object in response.contents() {
            total += object.size().unwrap_or(0).max(0);
        }
        pages += 1;

        if response.is_truncated().unwrap_or(false) {
            token = response.next_continuation_token().map(str::to_string);
            if token.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    crate::log_info!("object_store::bucket_usage: {total} bytes over {pages} page(s)");
    Ok(total)
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
