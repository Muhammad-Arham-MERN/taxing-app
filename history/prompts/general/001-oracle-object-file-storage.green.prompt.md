---
id: 001
title: Oracle Object Storage for File Bytes (schema v8, offline cache, cloud-migration CI)
stage: green
date: 2026-10-24
surface: agent
model: unspecified
feature: general
branch: 004-cloud-sync
user: H.A.R
command: (ad-hoc)
labels: ["object-storage", "oci", "aws-sdk-s3", "file-bytes", "schema-v8", "offline-cache", "migration", "github-actions", "storage-gauge"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/Cargo.toml
 - tax-statements-analysis/src-tauri/src/lib.rs
 - tax-statements-analysis/src-tauri/src/state.rs
 - tax-statements-analysis/src-tauri/src/files.rs
 - tax-statements-analysis/src-tauri/src/cloud/mod.rs
 - tax-statements-analysis/src-tauri/src/cloud/config.rs
 - tax-statements-analysis/src-tauri/src/cloud/secrets.rs
 - tax-statements-analysis/src-tauri/src/cloud/object_store.rs
 - tax-statements-analysis/src-tauri/src/cloud/schedule.rs
 - tax-statements-analysis/src-tauri/src/store/mod.rs
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/store/attachments.rs
 - tax-statements-analysis/src-tauri/src/store/client_records.rs
 - tax-statements-analysis/src-tauri/src/store/statements.rs
 - tax-statements-analysis/src-tauri/src/store/carry.rs
 - tax-statements-analysis/src-tauri/src/store/object_cache.rs
 - tax-statements-analysis/src-tauri/src/commands/error.rs
 - tax-statements-analysis/src-tauri/src/commands/cloud.rs
 - tax-statements-analysis/src-tauri/src/commands/statements.rs
 - tax-statements-analysis/src-tauri/src/commands/attachments.rs
 - tax-statements-analysis/src-tauri/src/commands/client_records.rs
 - tax-statements-analysis/src-tauri/src/commands/storage.rs
 - tax-statements-analysis/src-tauri/src/commands/onboarding.rs
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/hooks/useCloudSync.ts
 - tax-statements-analysis/src/components/cloud/StorageGauge.tsx
 - tax-statements-analysis/src/components/layout/RevealHeader.tsx
 - tax-statements-analysis/src/components/onboarding/SecretsDialog.tsx
 - tax-statements-analysis/src/components/ui/file-drop-field.tsx
 - tax-statements-analysis/src/components/statements/FileAttachmentField.tsx
 - migrations/package.json
 - migrations/README.md
 - migrations/object-storage/migrate.mjs
 - .github/workflows/release.yml
 - PROJECT_MAP.md
tests:
 - cargo check --offline — clean (no warnings)
 - npx tsc --noEmit — clean
 - npm test — 93 passed; 5 pre-existing failures (StatementsTable.test.tsx, CreateBillForm.test.tsx) unchanged
---

## Prompt

Implement the final piece before the app is production-level: store file **bytes** in Oracle
Cloud (OCI) Object Storage via the AWS SDK for Rust (S3 compatibility), keep only a string
reference in the Turso-synced store, hold the bytes locally so the app works offline, add a
Turso-like storage loader, and migrate the cloud database through GitHub Actions. Decisions
confirmed up front: a **separate local SQLite table** for the byte cache; the loader reads
bucket usage with **S3 ListObjectsV2** (no extra OCI RSA credentials); the **cloud-migration
CI job is implemented now**; delivery is **plan + code** (no new spec dir), with
`PROJECT_MAP.md` kept in sync.

## Response snapshot

1. **Dependency**: added `aws-sdk-s3 = "1"` (rustls only) to `Cargo.toml`; resolves to
   `aws-sdk-s3 1.152.0`.
2. **OCI client** (`cloud/object_store.rs`): manual `Config` build (path-style endpoint,
   `force_path_style(true)`, explicit `Credentials` — the `AWS_*` env is never read),
   `put/get/delete`, and `bucket_usage` (paginated `ListObjectsV2` size sum). Request/response
   checksum calculation restricted to `WhenRequired` for OCI interoperability.
3. **Secrets/config**: `secrets.rs` gains `STORAGE_KEYS` (the five `OCI_S3_*`); `Secrets` and
   `Config` gain `object_storage: Option<ObjectStoreConfig>`.
4. **Schema v8** (`store/mod.rs`, `store/schema.rs`): `attachments` and `client_record_files`
   drop their `data` BLOB and gain `content_type` + `object_key`; `migrate(conn, path, cache)`
   gains a v7→v8 step (`move_attachments_to_objects` / `move_record_files_to_objects`) that
   writes each BLOB to the local cache (marked pending) and rewrites the row — **no network**,
   so an upgrade completes offline.
5. **Local-only cache** (`store/object_cache.rs`): a second Turso database
   (`tax-statements-cache.sqlite`, never given a remote URL) with `object_cache`; put/get/
   mark_uploaded/pending/count_pending/remove.
6. **Pipeline** (`files.rs`): `AttachmentRef`, `store_file` (cache-first, best-effort upload),
   `fetch_bytes` (cache, else Oracle), `drain_pending`, `remove_object`.
7. **State/wiring**: the cache is opened in `setup` and held on `AppState` (beside the store
   mutex); `load/open_at` thread it into `schema::migrate`.
8. **Commands**: statement/record create + update build an `AttachmentRef` via `files::store_file`;
   open/save fetch through `files::fetch_bytes`; delete removes the cache row and Oracle object;
   `cloud_push` drains pending uploads **before** publishing; new `cloud_object_usage`.
9. **Frontend**: `ObjectUsage` type, `CloudRepository.objectUsage()`, `useCloudSync`
   `objectUsage`/`refreshObjectUsage`, an `ObjectStorageGauge` beside the Turso gauge, and the
   browser MIME type (`contentType`) carried in the raw-body meta.
10. **CI**: `migrations/` (Node + `@libsql/client` + `@aws-sdk/client-s3`) with
    `object-storage/migrate.mjs`; a new `migrate` job in `release.yml` that `publish` depends on.
11. `PROJECT_MAP.md` updated throughout (§1–§9) and this PHR written.

## Outcome

- ✅ Impact: file bytes leave the synced store for Oracle Object Storage; the store keeps only
  an `object_key`, so the cloud copy stays small. Saves never need the network (cache-first),
  uploads drain quietly at startup/connect/before-push, and a file attached on one machine is
  fetched from Oracle on another. The cloud DB is migrated deterministically in the same release.
- 🧪 Tests: `cargo check --offline` clean with no warnings; `npx tsc --noEmit` clean; `npm test`
  93 passed with the same 5 pre-existing failures in `StatementsTable.test.tsx` /
  `CreateBillForm.test.tsx` (documented as pre-existing in the 005 PHR).
- 📁 Files: 22 Rust, 10 frontend, 3 migration, 1 workflow, PROJECT_MAP.md.
- 🔁 Next prompts: exercise the whole flow in `npm run tauri dev` with the real OCI bucket
  (attach offline → push → open on a second store), and dry-run the `migrate` job against a
  scratch Turso database.
- 🧠 Reflection: the "separate local table" the request asked for cannot live inside the synced
  store (a Turso database syncs as a whole), so it had to become a **second local database** —
  which also happens to be the cleanest offline cache. Migrating a v7 store has no network at
  all; the bytes are parked in the cache marked pending and sent later, so the upgrade can never
  fail for want of a connection.

## Evaluation notes (flywheel)

- Failure modes observed: two `use of moved value: id` errors in the delete commands, because an
  `async move` closure captured the id before a second `with_connection` call; fixed by cloning
  the id for the reference lookup. Worth remembering for any read-then-delete command.
- Graders run and results (PASS/FAIL): cargo check PASS; tsc PASS; Vitest 93/98 PASS (5
  pre-existing failures unchanged).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a Vitest case for `InMemoryCloudRepository.objectUsage`
  and a Rust smoke path that attaches a file, checks the cache row is `uploaded = 0`, then drains.
