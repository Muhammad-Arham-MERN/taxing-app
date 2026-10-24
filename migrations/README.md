# Cloud migrations

One-shot migrations that must run against the **central Turso Cloud database**
before a release is published. They are separate from the application because
they run once, in CI, with credentials the installed app never needs.

The reason this exists: the application migrates each computer's local store on
update, but the *cloud* database is shared, so it must be brought to the same
shape deterministically — once — in the same release. Running both means every
machine (already-updated or not) converges on the same schema.

## `object-storage/migrate.mjs` — schema v7 → v8

Version 8 moves every file's **bytes** out of the synced store into Oracle Cloud
(OCI) Object Storage, leaving an `object_key` reference behind:

- `attachments` and `client_record_files` lose their `data` BLOB and gain
  `content_type` and `object_key`.
- Each existing BLOB is uploaded to the OCI bucket as `objects/<uuid>` using the
  same AWS SDK the app uses, then the row is rewritten with the reference.
- `user_version` and `app_meta.schema_version` are stamped `8` last.

It is **idempotent**: a table that no longer has a `data` column is skipped, so a
second run is a no-op and an interrupted run can simply be run again.

### Required environment

| Name | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | The cloud database URL (`libsql://…`). |
| `TURSO_AUTH_TOKEN` | The database write token. |
| `OCI_S3_ENDPOINT` | Path-style OCI Object Storage endpoint. |
| `OCI_S3_REGION` | OCI region identifier. |
| `OCI_S3_BUCKET` | The bucket the file bytes live in. |
| `OCI_S3_ACCESS_KEY_ID` | OCI customer secret key (access key). |
| `OCI_S3_SECRET_ACCESS_KEY` | OCI customer secret key (secret). |

In CI these come from GitHub Actions secrets of the same names.

### Running locally

```sh
cd migrations
npm install
node object-storage/migrate.mjs
```
