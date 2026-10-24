// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! The **offline byte cache**: the second, local-only database.
//!
//! A file's bytes are uploaded to Oracle Object Storage and the *synced* store
//! keeps only a reference (an object key). Because the whole synced store is
//! pushed as one database, anything that must **not** reach the cloud has to
//! live in a database of its own — which is exactly what this is: a separate
//! `tax-statements-cache.sqlite` file, opened with the plain local Turso engine
//! and **never** given a remote URL. It is what keeps the application usable
//! offline: a file attached with no connection is written here at once and
//! uploaded to Oracle later (`files::drain_pending`).
//!
//! A row is `uploaded = 0` until its bytes are confirmed present in Oracle. The
//! `bucket_usage`/`pendingUploads` figures the header shows come from here and
//! `cloud::object_store`.

use super::{schema, StoreResult};
use std::path::Path;
use std::sync::Arc;
use turso::{Builder, Connection, Value};

/// Which table the bytes belong to, mirrored into the row so a pending upload
/// can be described before its store row is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    Statement,
    Record,
}

impl Scope {
    pub fn as_str(self) -> &'static str {
        match self {
            Scope::Statement => "statement",
            Scope::Record => "record",
        }
    }
}

/// One cached file, as read back for an upload or a download.
#[derive(Debug, Clone)]
pub struct CachedObject {
    pub object_key: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub byte_size: i64,
    pub bytes: Vec<u8>,
}

/// The cache database handle. Cloned freely: it is an `Arc` over the engine, and
/// each operation takes a short-lived connection, so nothing here holds a lock
/// while the store's own connection is locked.
#[derive(Clone)]
pub struct ObjectCache {
    db: Arc<turso::Database>,
}

const DDL: &str = r#"
CREATE TABLE IF NOT EXISTS object_cache (
    object_key   TEXT PRIMARY KEY,
    scope        TEXT NOT NULL CHECK (scope IN ('statement','record')),
    file_name    TEXT NOT NULL,
    content_type TEXT,
    byte_size    INTEGER NOT NULL,
    data         BLOB NOT NULL,
    uploaded     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_object_cache_pending ON object_cache(uploaded);
"#;

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
impl ObjectCache {
    /// Open (creating if needed) the cache database at `path`.
    pub async fn open(path: &Path) -> StoreResult<ObjectCache> {
        crate::log_info!("object_cache::open: opening the cache database at {}", path.display());
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let db = Builder::new_local(&path.to_string_lossy()).build().await?;
        let conn = db.connect()?;
        conn.execute_batch(DDL).await?;
        crate::log_info!("object_cache::open: ready");
        Ok(ObjectCache { db: Arc::new(db) })
    }

    fn conn(&self) -> StoreResult<Connection> {
        Ok(self.db.connect()?)
    }

    /// Store a file's bytes locally, marked not-yet-uploaded. Replacing an
    /// existing key overwrites it (and resets the upload flag), which is what a
    /// file replacement wants.
    pub async fn put(
        &self,
        object_key: &str,
        scope: Scope,
        file_name: &str,
        content_type: Option<&str>,
        bytes: &[u8],
    ) -> StoreResult<()> {
        crate::log_debug!(
            "object_cache::put: {object_key} '{}' ({} bytes, scope={})",
            file_name,
            bytes.len(),
            scope.as_str()
        );
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO object_cache
                 (object_key, scope, file_name, content_type, byte_size, data, uploaded, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
             ON CONFLICT(object_key) DO UPDATE SET
                 scope        = excluded.scope,
                 file_name    = excluded.file_name,
                 content_type = excluded.content_type,
                 byte_size    = excluded.byte_size,
                 data         = excluded.data,
                 uploaded     = 0",
            (
                object_key,
                scope.as_str(),
                file_name,
                content_type,
                bytes.len() as i64,
                bytes,
                schema::now_iso().as_str(),
            ),
        )
        .await?;
        Ok(())
    }

    /// The bytes for one object key, or `None` when this machine does not hold
    /// them yet (a file another machine attached, whose bytes must be fetched).
    pub async fn get(&self, object_key: &str) -> StoreResult<Option<Vec<u8>>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query("SELECT data FROM object_cache WHERE object_key = ?1", [object_key])
            .await?;
        match rows.next().await? {
            Some(row) => match row.get_value(0)? {
                Value::Blob(bytes) => Ok(Some(bytes)),
                _ => Ok(None),
            },
            None => Ok(None),
        }
    }

    /// Note that the bytes are confirmed present in Oracle.
    pub async fn mark_uploaded(&self, object_key: &str) -> StoreResult<()> {
        crate::log_debug!("object_cache::mark_uploaded: {object_key}");
        let conn = self.conn()?;
        conn.execute(
            "UPDATE object_cache SET uploaded = 1 WHERE object_key = ?1",
            [object_key],
        )
        .await?;
        Ok(())
    }

    /// Every row whose bytes are not yet in Oracle, with their bytes, so an
    /// upload pass can send them.
    pub async fn pending(&self) -> StoreResult<Vec<CachedObject>> {
        let conn = self.conn()?;
        let mut rows = conn
            .query(
                "SELECT object_key, file_name, content_type, byte_size, data
                   FROM object_cache
                  WHERE uploaded = 0
                  ORDER BY created_at ASC",
                (),
            )
            .await?;

        let mut out = Vec::new();
        while let Some(row) = rows.next().await? {
            let object_key = match row.get_value(0)? {
                Value::Text(text) => text,
                _ => continue,
            };
            let file_name = match row.get_value(1)? {
                Value::Text(text) => text,
                _ => String::new(),
            };
            let content_type = match row.get_value(2)? {
                Value::Text(text) => Some(text),
                _ => None,
            };
            let byte_size = match row.get_value(3)? {
                Value::Integer(number) => number,
                _ => 0,
            };
            let bytes = match row.get_value(4)? {
                Value::Blob(bytes) => bytes,
                _ => Vec::new(),
            };
            out.push(CachedObject {
                object_key,
                file_name,
                content_type,
                byte_size,
                bytes,
            });
        }
        crate::log_debug!("object_cache::pending: {} row(s) awaiting upload", out.len());
        Ok(out)
    }

    /// How many rows are still awaiting upload (the header's pending figure).
    pub async fn count_pending(&self) -> StoreResult<i64> {
        let conn = self.conn()?;
        let mut rows = conn
            .query("SELECT count(*) FROM object_cache WHERE uploaded = 0", ())
            .await?;
        let count = match rows.next().await? {
            Some(row) => match row.get_value(0)? {
                Value::Integer(number) => number,
                _ => 0,
            },
            None => 0,
        };
        Ok(count)
    }

    /// Drop one cached row (its Oracle object is removed separately by
    /// `files::remove_object`).
    pub async fn remove(&self, object_key: &str) -> StoreResult<()> {
        crate::log_debug!("object_cache::remove: {object_key}");
        let conn = self.conn()?;
        conn.execute("DELETE FROM object_cache WHERE object_key = ?1", [object_key])
            .await?;
        Ok(())
    }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
