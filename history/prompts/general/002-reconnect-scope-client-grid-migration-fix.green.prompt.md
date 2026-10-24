---
id: 002
title: Reconnect = connectivity check only, Oracle 10 GB gauge, 2-up client grid, and a synced-store migration fix
stage: green
date: 2026-10-24
surface: agent
model: unspecified
feature: general
branch: 004-cloud-sync
user: H.A.R
command: (ad-hoc)
labels: ["cloud-reconnect", "storage-gauge", "oracle", "clients-grid", "migration-bug", "synced-store", "schema-version"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/src/state.rs
 - tax-statements-analysis/src-tauri/src/commands/onboarding.rs
 - tax-statements-analysis/src-tauri/src/commands/cloud.rs
 - tax-statements-analysis/src-tauri/src/cloud/config.rs
 - tax-statements-analysis/src-tauri/src/store/schema.rs
 - tax-statements-analysis/src-tauri/src/lib.rs
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/hooks/useCloudSync.ts
 - tax-statements-analysis/src/components/cloud/StorageGauge.tsx
 - tax-statements-analysis/src/components/clients/ViewClientsTab.tsx
 - tax-statements-analysis/src/components/clients/ClientCard.tsx
 - tax-statements-analysis/src/index.css
 - PROJECT_MAP.md
tests:
 - cargo check --offline — clean
 - npx tsc --noEmit — clean
---

## Prompt

Three asks: (1) make the header's **Reconnect** button do only what its name says — confirm the
cloud connection and re-fetch the Turso and Oracle storage figures, never push or pull; (2) the
Oracle bucket has **10 GB**, so the Oracle gauge should be a progress bar like the Turso one, in
purple; (3) the Clients view wastes horizontal space — make the client blocks fill the container
with **two per row**. Then a bug report: an existing (synced) store now opens as **"damaged"**
with `Parse error: no such column: relative_path`.

## Response snapshot

1. **Reconnect re-scoped.** `cloud_reconnect` (new command) ensures the store is on the synced
   engine (a local switch — `ensure_synced_session`, no pull) and then proves connectivity with
   real round trips to Turso's platform Usage API and Oracle's `ListObjectsV2`. It returns
   `ReconnectResult { connected, verified, message, usage, objectUsage }` and **never pushes or
   pulls**. The engine-switch logic was extracted from `setup_connect` into
   `state::ensure_synced_session` / `state::restore_local`; `setup_connect` (onboarding) keeps its
   pull, since a freshly set-up machine should receive its records. `useCloudSync.reconnect` now
   calls `cloud.reconnect()` and sets both gauges from the result.
2. **Oracle 10 GB + purple.** `OBJECT_ALLOWANCE_BYTES = 10 GiB`; `ObjectUsage` now carries the
   allowance and remainder; a new `--oracle` theme token (dark `#a855f7`, light `#9333ea`) drives
   a purple label and bar on `ObjectStorageGauge`.
3. **Clients 2-up.** The card row was a `flex flex-wrap` of fixed `w-80` cards; it is now
   `grid grid-cols-1 gap-4 sm:grid-cols-2` with `ClientCard` at `w-full`, so two blocks per row
   span the whole container.
4. **Migration bug fixed.** `schema::migrate` read the **file header** `user_version`, which the
   Turso sync engine owns and reports as `0` on a synced store — so every open re-ran *all*
   migration steps. After the v7→v8 reshape, the second open re-ran the old v5→v6 step against an
   `attachments` table that no longer had `data` or `relative_path`, and the query failed. Added
   `schema::current_version()` (header, else the `app_meta` marker — exactly what
   `verify_connection` already did) plus a re-run guard in `migrate_attachments_in` for the
   already-reshaped case.
5. `PROJECT_MAP.md` and this PHR updated.

## Outcome

- ✅ Impact: Reconnect now has one job and cannot move data; the Oracle gauge reads 10 GB with a
  purple bar; the Clients grid fills its container two-up; and a synced store no longer re-runs
  its migrations on every open (the "damaged" report).
- 🧪 Tests: `cargo check --offline` clean; `npx tsc --noEmit` clean.
- 📁 Files: 6 Rust, 7 frontend, 1 CSS, PROJECT_MAP.md.
- 🔁 Next prompts: re-open the existing store with `npm run tauri dev` to confirm it recovers,
  then exercise the Reconnect button and the two gauges.
- 🧠 Reflection: the sync engine owning the file header is the same fact `verify_connection`
  already accounts for via the content marker — `migrate` simply had not been held to it. The
  lesson: any migration/identity read on a *synced* store must go through the marker, never the
  header.

## Evaluation notes (flywheel)

- Failure modes observed: the header-vs-marker version mismatch was invisible until a migration
  step became non-idempotent (re-shaping a table), at which point re-running turned destructive.
  A store in the field hit exactly this; the fix is defensive on two levels (correct version +
  re-run guard).
- Graders run and results (PASS/FAIL): cargo check PASS; tsc PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a Rust test that opens a v8-synced-shaped store whose
  header reads 0 and asserts `current_version` returns the marker and `migrate` is a no-op.
