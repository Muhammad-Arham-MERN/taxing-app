# Quickstart: Offline Work — Communicate Live (Cloud Sync)

**Feature**: `004-cloud-sync` | **Date**: 2026-10-15 | **Plan**: [plan.md](./plan.md)

How to run the module, what to do to prove each story, and where everything lands on disk. Per the developer's direction there are **no automated backend tests**, so this walkthrough — plus the R1 spike — **is** the acceptance procedure. The existing Vitest suite is the only automated coverage and must keep passing.

---

## 0. Before anything else — the R1 engine-parity spike (gate)

The store engine is swapped from `rusqlite` to `turso` (R2). Before writing the migration, prove the engine against a **copy** of a real store:

1. Copy a real `tax-statements.sqlite` to a scratch folder (never work on the original).
2. With the `turso` crate, open the copy and check: `PRAGMA application_id`/`user_version` read **and write**; `STRICT` tables; `CHECK`/`NOT NULL`/`UNIQUE`; `COLLATE NOCASE` FK matching; `FOREIGN KEY ... ON DELETE CASCADE`; `PRAGMA table_info`; `GROUP_CONCAT`/`SUM`; and a statement + bill + customer round trip (research R1).
3. If **any** check fails, **stop** and take the plan's fallback (Objection 2b: keep `rusqlite`, add a Turso exchange database plus a change queue and app-side merge). Do not proceed with the swap.

---

## 1. Prerequisites

- **Node.js + npm** and the **Rust toolchain (edition 2021, 1.77.2+)** — as before.
- **No MSVC build tools needed any more.** Removing `rusqlite` (and its `bundled` C SQLite) removes the C compiler prerequisite the build machine previously needed.
- **New backend crates**: `turso` (`sync`), `tokio`, an HTTP client (`reqwest`), and a credential-store crate (`keyring`, or `windows-sys` with its credentials feature) — all pulled by `cargo`, no system libraries.
- **The partner's env file** — a small text file holding the five required values (R4): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TURSO_ORG`, `TURSO_DATABASE`, `TURSO_PLATFORM_TOKEN`. It is **not** built into the installer; the practitioner pastes it at onboarding, where the values are saved to Windows Credential Manager.

## 2. Run it

```bash
cd tax-statements-analysis
npm install
# no build-time secrets; paste the partner's env file in the app's onboarding
npm run tauri dev
```

Frontend tests (the only automated coverage):

```bash
npm test
```

## 3. Where things live on disk

| What | Where |
|---|---|
| Statements, bills, customers | The **same** store file the practitioner already chose — `tax-statements.sqlite` — now a **Turso local-first database**. |
| Attachment bytes | An **`attachments/`** folder **beside the store file** (moved out of the store at v5, R5). **Never synced.** |
| Un-pushed marker | `%APPDATA%\com.har.tax-statements-analysis\sync-state.json` (R8). |
| The remembered location | `%APPDATA%\…\settings.json` — unchanged. |
| Temporary copies of invoices/attachments while open | The per-run temp folder, unchanged. |
| The central copy | The Turso Cloud database named by the secrets held in Windows Credential Manager. |
| The cloud secrets | **Windows Credential Manager** (the current Windows user's store), one entry per key (R4). **Never in a file.** |

The store is **version 5** after this module. A store created by Modules 2/3 is migrated additively on first open (data-model §1.4); its statements are untouched and its attachment bytes are moved to the folder.

---

## 4. Acceptance walkthrough

### Story 6 (prerequisite) — set up a new computer

1. Launch on a fresh machine. Because neither a store nor the secrets exist, **setup** is shown, not the application (FR-005).
2. Choose where records will live (the existing storage step), then paste the partner's env file into the secrets screen.
3. Submit an incomplete file first: the screen names the missing value and saves nothing (FR-048; SC-019). Fix it and submit again.
4. On success the application becomes usable, and it does **not** ask for the secrets again after a restart (FR-047, FR-049).
5. Confirm the installer and the application's files contain no secrets, and that the values live only in Windows Credential Manager (FR-046; SC-017, SC-018).
6. Deliberately paste a fresh env file → the stored values are replaced (FR-049).

### Story 1 — push local changes to the cloud

1. Launch with internet **off**. Create a statement and a bill. Everything works exactly as before (FR-001; SC-001).
2. Turn internet **on**. Press **Push**. A **progress indicator** shows for the duration (FR-036), then a clear **success** message appears (FR-009).
3. Press **Push** again. It reports **nothing new** and creates no duplicate (FR-010; SC-003).
4. Turn internet **off** and press **Push**. It reports **internet unavailable**; the local records are unchanged and the change is still pending (FR-012; FR-008).
5. Confirm Push/Sync use the connection details from Windows Credential Manager and never ask for them again (FR-047).
6. Paste a wrong URL/token (re-place the secrets) and press **Push**: it reports **server unavailable**, distinct from "no internet" (FR-033).
7. Confirm the local records are identical after a successful push (FR-008).

### Story 2 — sync changes down from other computers

1. On computer A (a second machine, or a second store file against the same remote), create a statement and **Push**.
2. On computer B, press **Sync**. A **progress indicator** shows, then a clear outcome; the statement appears (FR-014; SC-002).
3. Press **Sync** again → **nothing new**, no duplicate (FR-015; SC-003).
4. **Restart B** → the change is still there and behaves like a local record (FR-016).
5. Edit the same record on both A and B while apart, Push on both, then Sync on both → both end up identical, by **last push wins** (FR-019; SC-012).
6. Delete a record on A, Push; Sync on B → the record is gone on B (FR-020).

### Story 3 — sync happens on its own

1. With internet on, launch the app. Within a short time it pulls without any action (FR-021; SC-005); if something changed, the lists refresh on their own (`cloud://pulled`, R9).
2. Leave it open about an hour → it pulls again (FR-022; SC-006).
3. Start typing a statement or bill, then let an automatic pull run → the in-progress form is untouched (FR-023).
4. Turn internet off for an automatic pull → nothing is disturbed; it retries later (FR-024).

### Story 4 — safeguard un-pushed work when closing

1. Make a change with internet on but **do not push**. Close the app → a **warning** offers to push (FR-025; SC-007).
2. Choose **Push** → it pushes, then the app closes (FR-026).
3. With internet off, make a change and close → the warning still appears; choosing to push reports why it cannot, and you can close anyway (FR-026/FR-028).
4. Choose **close anyway** → reopen and press Push → the change is still there and publishes (FR-027; SC-008).
5. Close with nothing pending → **no warning** (FR-028).

### Story 5 — see how much cloud space remains

1. Look at the header → **"Turso Cloud"** with a **purple** gauge showing storage left out of the 5 GB allowance (FR-029).
2. Push or Sync more data → the gauge reflects the change (FR-030).
3. Turn internet off (or remove the Usage credentials) → the gauge reads **unavailable**, not a stale number (FR-031).
4. Fill the shared copy near the allowance → the gauge makes the little remaining space plain (FR-032).

### Cross-cutting

- **Offline end to end.** With the network disabled, every create/edit/view/delete for statements, bills and customers works (FR-001; SC-001).
- **Text-only cloud.** Confirm the cloud copy holds no attachment bytes: the store has no BLOB column after v5 and attachment files sit beside the store only (FR-039/FR-041/FR-042; SC-014).
- **Attachment still works.** Add an attachment to a statement, open it (OS viewer) and save a copy: the bytes come from the `attachments/` folder (R12), and the cloud copy is unaffected.
- **Location change.** Change the storage directory and choose to bring records: the store **and** its `attachments/` folder move together (data-model §5).
- **Existing store upgrade.** Point the app at a Modules 2/3 store: it opens, migrates to v5, moves attachment bytes to the folder, and all records are intact (data-model §1.4).

---

## 5. Known bounds and gotchas

- **Engine swap is all-or-nothing.** The R1 spike gates it; without a green spike, do not start the migration.
- **`bootstrap_if_empty(false)`.** The store never bootstraps from the remote on first launch, so an existing local store is never fought by the cloud (R2). The first exchange is an explicit **Push** (upload) or **Sync** (download).
- **Last push wins, always.** There is no merge UI and no content comparison; the latest push to a record is what every computer ends up with (FR-019, FR-043).
- **Two independent creations stay two records.** If the same new record is entered on two computers while apart, they remain two rows — there is no content-based reconciliation by the developer's choice. Delete the unwanted one; the deletion travels on the next exchange.
- **The secrets live in Windows Credential Manager**, which is per-Windows-user, so anyone using that Windows account can use them. The application keeps no other copy and never logs or shows them; re-paste a fresh env file to rotate (plan Objection 1).
- **Setup is a hard gate.** A machine whose secrets were never pasted shows setup, not the application (FR-005).
- **Nothing is packaged.** The installer carries no secret; the partner's env file is the hand-off (R4).
- **The un-pushed marker is local.** Wiping `sync-state.json` makes the app believe there is nothing to push; the data is still safe and a manual Push still works.
- **No backend tests.** The engine swap, the v5 migration and the real `push()`/`pull()` are verified by this walkthrough, not by tests (developer's direction).

## 6. When something goes wrong

| Symptom | Likely cause | Where to look |
|---|---|---|
| Setup keeps asking for the secrets | They were never saved, or the credential store could not be written | R4; check Windows Credential Manager and re-paste |
| The secrets screen rejects the paste | A required key is missing, or the file is malformed | FR-048 — the message names the key |
| Push/Sync says **secrets unavailable** | Windows Credential Manager holds no secrets (or cannot be read) | R4/R7; re-paste the env file |
| Push/Sync says **no internet** while online | DNS/connection blocked | R7 — classified from the sync error |
| Push/Sync says **server unavailable** while online | Wrong URL/token, or the cloud is down | R7; check the pasted secrets |
| Store opens with attachment errors after upgrading | The v5 migration could not move a BLOB to disk | data-model §1.4 — reopen; the migration is resumable |
| Store will not open at all | R1 parity gap, or the file is damaged | R1; the file is left untouched |
| The gauge always reads unavailable | The Usage-API values (org/database/platform token) are missing from the pasted secrets | R11; the sync itself still works |
| The close warning never appears | The window hook is not active, or the marker is clear | R6, R8 |
