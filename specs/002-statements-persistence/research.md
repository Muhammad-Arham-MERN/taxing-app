# Phase 0 Research: Local Statement Persistence and Editing (Module 2)

**Feature**: `002-statements-persistence` | **Date**: 2026-09-14 | **Plan**: [plan.md](./plan.md)

Every unknown in the plan's Technical Context is resolved below. Each entry records what was decided, why, and what was rejected. Version figures are the published stable versions at research time and must be pinned by `Cargo.lock` / `package-lock.json` rather than trusted from this document.

---

## R1 — How SQLite is provided, and what that costs

**Decision**: `rusqlite` with the `bundled` feature. SQLite is compiled from C source inside the crate and linked statically into the executable.

**Rationale**: The spec's hard constraint is that the practitioner installs and administers nothing (FR-011) and that the application works offline (FR-009). `bundled` is the only option that ships SQLite inside the binary, so there is no `sqlite3.dll` to deploy and no system library to match. It is also the option the crate documents specifically as the answer to linking difficulty on Windows.

**Alternatives considered**:
- *Link against a system SQLite* — rejected: pushes an installation onto the practitioner.
- *`sqlx`* — rejected: async machinery and a heavier dependency for a single-user desktop app with ~12 commands.
- *`tauri-plugin-sql`* — rejected: it exists to run SQL **from the frontend**, which directly contradicts the developer's stated design that the backend retrieves and stores the data.
- *PostgreSQL* — rejected earlier in `/sp.specify` (clarification of 2026-09-14): a server RDBMS cannot satisfy "fully offline, nothing installed" without bundling a server.

**Consequence to carry**: a **C compiler is required at build time** (MSVC build tools on Windows). This is a new prerequisite for the development machine, not for the practitioner. See plan Objection 2.

---

## R2 — Journal mode: rollback journal, not WAL

**Decision**: Keep SQLite's default rollback journal (`journal_mode = DELETE`) and the default `synchronous = FULL`. Do not enable WAL.

**Rationale**: FR-057/FR-058 make the store file a thing the practitioner copies, keeps as a backup, and later points the application at. In WAL mode the `.db` file is **not** the whole store — the `-wal` and `-shm` sidecars are part of its state, and copying only the `.db` can lose committed transactions or produce a corrupt copy. WAL's real advantage (readers never blocking the writer) is irrelevant for a single-user, single-instance application (FR-054). Default mode keeps the promise "one file is your whole bookkeeping" literally true.

**Alternatives considered**:
- *WAL + `synchronous=NORMAL`* — faster writes, but adds sidecar files that must travel with the store and requires checkpoint management before any copy. Rejected because it works against the backup/recovery requirement.
- *`journal_mode=MEMORY` or `synchronous=OFF`* — rejected outright: both are documented as able to corrupt the database on power loss.

**Note**: with a normal journal mode, SQLite's atomic-commit protocol makes a transaction all-or-nothing even across power loss. An application crash never loses committed data regardless of settings.

---

## R3 — Blob placement and the metadata-only guarantee

**Decision**: A separate `attachments` table holding `data BLOB` as the **last** column, joined to statements.

**Rationale**: FR-029, FR-030 and SC-011 require a date-range review to transport no attachment contents at all, and SC-004 requires it to stay fast when the listed statements carry large attachments. SQLite stores a row's payload on overflow pages once it exceeds the page capacity (for a 4096-byte page: more than 4061 bytes spills, with at least 489 bytes kept on-page), and **reads those overflow pages only when it must advance past the overflowing column**. Keeping the blob in its own table, last in column order, and never selecting it in the list query turns the requirement into a structural property of the schema rather than a rule implementers must remember.

**Alternatives considered**:
- *Blob column on the statements table* — works only while the blob is last and never selected. Any column added after it (an `updated_at`, a category) silently drags every attachment into memory on every list query. Rejected as a trap for later changes.

**Limits to respect**: default `SQLITE_MAX_LENGTH` is 1,000,000,000 bytes and is also the maximum row size, so a single attachment plus its row must stay under ~1 GB. The spec imposes no size limit (developer decision of 2026-09-14), so this is the one real ceiling and belongs in `quickstart.md` as a known bound rather than an error to discover.

**Query discipline**: the list query selects metadata and `file_name` only and never calls `get` for the blob column. The whole-blob `SELECT` is reserved for the single on-demand fetch (FR-036/FR-037).

---

## R4 — Write atomicity

**Decision**: Every write is a single rusqlite `Transaction`, committed explicitly; anything that returns early drops the transaction and rolls back. A statement and its attachment are written in **one** transaction.

**Rationale**: FR-005 requires that an interrupted write leaves no partial statement, and FR-042 requires an edit to replace the record in place. rusqlite's `Transaction` rolls back on `Drop`, so the failure path is the default path rather than something that must be remembered. With a normal journal mode and default synchronous setting, an OS-level interruption is recovered by SQLite on the next open, leaving no partial record or partial blob.

**Alternatives considered**: autocommit per statement — rejected, because a statement row and its attachment could then diverge on failure, which is exactly the partial record FR-005 forbids.

**Leftover files**: an interrupted session may leave a `-journal` file beside the store. SQLite recovers it automatically on next open. This is not corruption and the application must not "clean it up".

---

## R5 — Handling large attachments without loading them whole

**Decision**: Import, export and carry-across use **incremental BLOB I/O**: create the destination row with `ZEROBLOB(size)` to reserve the space, then copy in ~256 KiB chunks through a read handle on the source and a write handle on the destination.

**Rationale**: the spec allows attachments of any size, and a naive read-into-`Vec` makes peak memory proportional to the largest file — a several-hundred-megabyte scan would spike the process. Chunked copying keeps peak memory at one buffer regardless of file size. rusqlite exposes this through `Connection::blob_open` and `Blob::{read_at, write_at}` behind the `blob` feature.

**Constraints to design around**: the blob API cannot change a blob's size (hence `ZEROBLOB` first, then write in place); it does not work on `WITHOUT ROWID` tables (the schema uses ordinary rowids); a row update or delete invalidates an open handle; the column cannot be indexed or a primary key when opened read/write.

**Alternatives considered**: plain `Vec<u8>` parameters — fewer lines, rejected for the memory spike. `ATTACH DATABASE` + `INSERT INTO ... SELECT` — lets SQLite stream internally and is attractive for a whole-store copy, but still handles whole rows, so it is only a candidate for the small-record path, not for attachment blobs.

---

## R6 — Verifying that a chosen file really is one of our stores

**Decision**: Layered check, cheapest first, entirely **read-only**:
1. Open with `SQLITE_OPEN_READ_ONLY` and run a trivial query, catching `ErrorCode::NotADatabase` (SQLite's `SQLITE_NOTADB`, raised on first read rather than necessarily at open).
2. Check `PRAGMA application_id` against the application's own 32-bit marker.
3. Check `PRAGMA user_version` against a recognised schema version.
4. Confirm the expected tables exist via `sqlite_master`.

**Rationale**: FR-059 requires verification before use and FR-060 requires rejection with the file left untouched. Everything above is O(1) or O(schema) — cheap enough to run on every open, including startup. Opening read-only is what makes "left completely untouched" (FR-060, SC-020) true by construction rather than by care. `application_id` is the header field SQLite reserves precisely so an application can recognise its own file format, and `user_version` is the natural place for the schema version the developer deferred.

**Alternatives considered**:
- *`PRAGMA integrity_check` / `quick_check` on open* — rejected as the routine path: both scan essentially the whole file, so on a multi-hundred-megabyte store they are O(N) and would make startup unacceptably slow. `quick_check` (skips index-content and UNIQUE verification, so it is much faster than `integrity_check`) remains available as a user-invoked or post-crash action, but is not run on every open.
- *Extension or filename matching* — rejected: the spec asks for verification that the file "follows the pattern", and a renamed or foreign file must be rejected. A name proves nothing.

---

## R7 — Carrying records between stores, and what makes it safe to repeat

**Decision**: Copy statement by statement (and its attachment blob by chunked I/O), each in its own transaction, **skipping any statement whose identity already exists in the destination**. Identity is the statement's stable id, generated once at creation.

**Rationale**: three spec requirements interlock here. FR-021 requires an interrupted carry-across to lose nothing and leave the source usable — per-statement transactions satisfy that, because the source is never modified at all. FR-063 requires a statement already present in the destination not to be added again or altered — skipping by identity satisfies that. Together they make the whole operation **idempotent and therefore resumable**: because re-running skips what is already there, a run interrupted by a crash or a full disk can simply be run again, with no duplicate records and no lost ones. That is a strictly better outcome than one long transaction, which for a large store would hold a write transaction open for a long time and restart from nothing on failure.

**Alternatives considered**:
- *One transaction for the entire carry-across* — all-or-nothing and simpler to reason about, but a failure after ten minutes of copying discards all of it, and it holds a write lock for the duration.
- *File-level copy of the store* — impossible in general, because the destination may be an existing store that must keep its own records (FR-063), so a merge is required, not a replacement.

**Dedupe needs a stable identity**: this is why ids are `TEXT` UUIDs assigned at creation and never reused. Module 1's in-memory implementation already generated UUIDs; the store keeps that property and becomes the authority for it.

---

## R8 — Tauri v2 integration surface

**Decision**: `tauri-plugin-dialog` for the folder/file/save pickers, `tauri-plugin-single-instance` for FR-054, `tauri-plugin-opener` (already a dependency) for handing a file to the OS, and a plain `settings.json` in `app.path().app_config_dir()` for remembering the chosen location.

**Rationale**:
- **Dialog**: one plugin covers all three needs — folder picking, existing-file picking with extension filters, and a save-as prompt returning a destination path. `dialog:default` grants the needed commands; no scope is required.
- **Single instance**: the plugin implements FR-054 as a named Windows mutex plus a message-only window, and **must be registered first** in the builder chain. It exposes no JS API and needs no capability. Its identifier derives from `tauri.conf.json`'s `identifier`, which is already unique to this application.
- **Opener**: `app.opener().open_path(path, None)` delegates to `ShellExecuteW`, which is the OS default-handler behaviour the spec asks for. Calling it from **Rust** is not gated by capabilities; only a direct JS `openPath` call would need `opener:allow-open-path` with a scope. The application calls it from Rust, so the frontend never needs that permission.
- **Settings**: exactly one value (the chosen location) must be readable *before* the store is open. A plain JSON file via `std::fs` needs no new crate, no npm package and no IPC permission, and keeps the value on the Rust side where the gate logic lives.

**Alternatives considered**:
- *`tauri-plugin-store`* — rejected for this purpose: it resolves relative paths against `AppData` rather than the config dir, and its reason to exist is letting the **frontend** read and write settings, which this design deliberately avoids.
- *Driving the dialogs from the frontend* — viable and would need `dialog:default`, but then the chosen path crosses the IPC boundary only to come straight back. Keeping the pickers in Rust keeps the decision logic on one side.

**Note on the opener's failure mode**: `ShellExecuteW` returns a value ≤ 32 on failure (`SE_ERR_NOASSOC` = 31 when nothing is registered for the type), but it may also present Windows' own "How do you want to open this file?" picker. FR-075's "tell them plainly and still allow saving a copy" must therefore be driven by checking the result, not by assuming a clean error.

---

## R9 — Classifying a chosen location on Windows

**Decision**: Classify with `GetVolumePathNameW` to resolve the path to its volume root, then `GetDriveTypeW` on that root; treat `DRIVE_REMOTE` and `DRIVE_REMOVABLE` as risky, and add a **cloud sync-root check** for the synced case. This drives FR-055's warning.

**Rationale**: `GetDriveTypeW` alone is not enough in either direction. It cannot see a share reached through a mapped drive letter or a mounted folder, which resolving the volume root first fixes, and it handles UNC roots natively (returning `DRIVE_REMOTE`). For cloud folders there is no attribute to test on the *folder*: the OneDrive folder is generally not a reparse point, and only dehydrated placeholder files carry the cloud tags — so the dependable folder-level signal is the Cloud Files API's sync-root query, with environment/registry path hints as a fallback.

**Alternatives considered**:
- *Path-prefix matching alone* (`%OneDrive%`, folder names) — rejected as the primary check: it misses other providers and any folder the user renamed.
- *Reparse-point/attribute checks on the folder* — rejected: documented to miss Files-On-Demand folders entirely.
- *Blocking instead of warning* — rejected by the developer's answer of 2026-09-14: any folder is permitted once the practitioner confirms.

**Honest limitation**: `GetDriveTypeW` reports what the volume manager thinks, not where the bytes live, and it reports many USB drives and external SSDs as `DRIVE_FIXED`. A robust removable check adds the device removal policy, but the whole classification remains **best-effort**. This is acceptable precisely because the outcome is a warning rather than a refusal — but it must not be presented to the practitioner as a guarantee.

---

## R10 — Temporary copies and clearing them

**Decision**: Write outgoing attachments into a **per-run subfolder** under an application-owned folder (`app.path().app_cache_dir()`), and at startup best-effort delete every *other* run folder, ignoring files still locked by a viewer.

**Rationale**: FR-069 requires the copies to live in a folder the application manages, separate from the store, and cleared on the next launch; FR-070 forbids deleting a copy still in use. A per-run folder means the current session's files are never candidates for deletion, so a viewer holding a file open cannot block the new session — which a single shared folder could. Windows refuses to delete a file another process holds open without `FILE_SHARE_DELETE`, surfacing as `ERROR_SHARING_VIOLATION` (32) or `ERROR_ACCESS_DENIED` (5) — and these are **not** mapped by Rust's `ErrorKind`, so the cleanup must inspect `raw_os_error()` and tolerate those codes rather than treating them as failures.

**Alternatives considered**:
- *A single shared temp folder cleared at startup* — simpler, but a file still open from the previous session makes cleanup partially fail and leaves the folder mixed.
- *Deleting each copy as soon as the viewer opens it* — rejected by the developer and technically unsound: the application cannot know when the external program has finished reading.
- *Scheduling deletion for the next reboot* — rejected: requires administrator rights and cannot span a network share.

---

## R11 — Amounts

**Decision**: Store amounts as **integer minor units** (paisa) in a `INTEGER NOT NULL` column; convert at the seam boundary so the frontend keeps using a decimal number.

**Rationale**: SC-002 and the totals invariant require that displayed sums match the listed statements exactly, 100% of the time. Binary floating point cannot guarantee that for decimal currency. Module 1's own deferred contract already recommended minor units for this reason. Conversion at the seam means no component changes.

**Alternatives considered**: `REAL` — rejected, drift; `NUMERIC`/decimal text — works but does not remove the need for careful conversion and gives no advantage over integers for a two-decimal currency.

---

## R12 — Dates

**Decision**: Store dates as ISO `YYYY-MM-DD` `TEXT`, and compare them lexicographically for range filtering, exactly as Module 1's seam already does.

**Rationale**: FR-027 needs inclusive range filtering that is correct across month and year boundaries; ISO text sorts and compares correctly for that purpose, and it preserves the exact wire format the frontend already uses (FR-051). A separate integer or Julian column would add a conversion with no benefit at this scale.

---

## Resolved unknowns summary

| Technical Context field | Resolution |
|---|---|
| SQLite provisioning | `rusqlite` + `bundled`, statically linked (R1) |
| Journal mode | Rollback journal, `synchronous = FULL` (R2) |
| Attachment storage | Separate `attachments` table, blob last (R3) |
| Write atomicity | One transaction per write, rollback on drop (R4) |
| Large attachment I/O | `ZEROBLOB` + chunked incremental BLOB I/O (R5) |
| Store verification | Read-only open, header marker, `user_version`, table check (R6) |
| Carry-across | Per-statement, skip-by-identity, idempotent (R7) |
| Dialogs / single instance / opener / settings | `tauri-plugin-dialog`, `tauri-plugin-single-instance` (registered first), `tauri-plugin-opener` from Rust, `settings.json` in the config dir (R8) |
| Location classification | `GetVolumePathNameW` + `GetDriveTypeW` + cloud sync-root check (R9) |
| Temporary copies | Per-run folder under the app cache dir, best-effort cleanup tolerating locked files (R10) |
| Amounts | Integer minor units (R11) |
| Dates | ISO text, lexicographic range comparison (R12) |

**No `NEEDS CLARIFICATION` remains.** Every open decision that the spec deliberately deferred (store upgrades across application versions) is recorded as out of scope in the spec, and this plan stamps `user_version` so the information is available when that decision is taken.
