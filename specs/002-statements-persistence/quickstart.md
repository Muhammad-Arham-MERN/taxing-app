# Quickstart: Local Statement Persistence and Editing (Module 2)

**Feature**: `002-statements-persistence` | **Date**: 2026-09-14 | **Plan**: [plan.md](./plan.md)

How to run the module, what to click to prove each story works, and where everything lands on disk. Per the developer's direction there are no automated backend tests, so this walkthrough *is* the acceptance procedure.

---

## 1. Prerequisites

- **Node.js** and **npm** (the frontend toolchain; already in use for Module 1).
- **Rust** toolchain, edition 2021, **1.77.2 or newer** (the dialog plugin's minimum).
- **A C compiler — new for this module.** `rusqlite`'s `bundled` feature compiles SQLite from C source, so the machine that *builds* the application needs the **MSVC build tools** (installable as "Desktop development with C++" in the Visual Studio Installer). Without them the Rust build fails with a linker error that does not obviously name the cause. This is a build-time requirement only — the shipped application needs nothing on the practitioner's machine.

## 2. Run it

```bash
cd tax-statements-analysis
npm install
npm run tauri dev
```

The first Rust build is slow — SQLite is compiled from source once, then cached.

Frontend tests (unchanged from Module 1, and the only automated coverage):

```bash
npm test
```

## 3. Where things live on disk

| What | Where |
|---|---|
| The store file | A location the practitioner chose. `directory` → a file created inside it; `file` → the file they pointed at. |
| The remembered location | `%APPDATA%\com.har.tax-statements-analysis\settings.json` |
| Temporary copies of attachments while open | `%LOCALAPPDATA%\com.har.tax-statements-analysis\…\attachments\<run-id>\` — cleared on the next launch |

Deleting `settings.json` makes the application behave exactly like a fresh installation, which is how the recovery walkthrough below is staged.

## 4. Acceptance walkthrough

### Story 1 — records survive closing the application

1. Launch. The **gate** appears: nothing else is reachable (SC-006).
2. Choose a folder. The Application becomes usable and `<folder>/tax-statements.sqlite` (or the file name the application uses) appears there.
3. Record a statement with an attachment. Confirm the Create form resets and the date returns to today.
4. **Close and reopen.** The statement is still there with identical date, type, nature, amount, remarks and file name (SC-001).
5. Open the View tab over a range covering it. Totals and balance match the listed rows (SC-002, SC-003 not yet — that is Story 5).
6. Disconnect from the network and repeat 3–5. Everything still works (SC-006).

**Check**: the range review is as fast with a 200 MB attachment attached as without it (SC-004) — the list never reads it.

### Story 2 — choosing and moving the location

1. With records present, open **Choose Storage Directory** in the header. The Settings control must be gone (FR-018).
2. Pick a *different* folder. You are asked whether to bring the existing records across or start fresh (FR-019).
3. Choose **bring**. Confirm every statement and attached file is present in the new location and the totals are unchanged (SC-009).
4. Confirm the **old store file still exists** in the previous folder, untouched (FR-022).
5. Change location again and choose **start fresh**. The new location holds none of the previous records, and the previous store file is still there.
6. Cancel the picker. Nothing changes (FR-024).
7. Try a folder you cannot write to (or a read-only USB stick). You are told why, and the current location keeps working (FR-023).
8. On a network share or a OneDrive/Dropbox folder: you are warned first, and it is accepted only after you confirm (SC-017).

### Story 3 — correcting a saved statement

1. In the View tab, open a listed statement for editing. Every field is prefilled (FR-038).
2. Change the amount, save. The row and the totals update, and the record count does not grow (SC-008).
3. **Restart.** The correction is still there (SC-010).
4. Remove the attachment and save. The File column reads "None" (FR-040).
5. Replace the attachment with a different file and save. The new name shows; the old file is gone from the record (FR-041).
6. Open an edit, change something, then abandon it. The stored record is unchanged (SC-009).
7. Edit a statement's date so it falls outside the displayed range. It leaves the list and the totals drop it (FR-048).
8. Try saving an invalid edit — Save is unavailable and nothing is written (FR-044).

### Story 4 — recovering from a backup file

1. Copy the store file somewhere else (this is the "backup").
2. Delete `settings.json` so the application starts as if freshly installed.
3. At the gate, choose the **file** option and point at the copy.
4. Every statement, attachment and total it held is available (SC-019).
5. Point at a file that is **not** a store — a PDF, an unrelated SQLite file, a renamed text file. It is rejected with a reason and **the file is unchanged** (check its hash before and after) (SC-020).
6. Point at a valid but empty store file. It is accepted and you can record into it (FR-064).

### Story 5 — opening and saving an attachment

1. Click a PDF's file name. It opens in your default PDF application, with the name you gave it (FR-065, FR-066, FR-068).
2. Repeat for an image and a spreadsheet.
3. Check the store is untouched: the statement and its attachment are unchanged afterwards (SC-024).
4. Use save-a-copy, choose a destination, and confirm the saved file is byte-identical to what was attached (SC-025).
5. Cancel the save prompt → nothing is written, `null` returned.
6. Click the same attachment twice. It opens with no accumulation of copies.
7. **Restart.** The temporary folder from the previous session is cleared (SC-027).
8. Try a type with nothing registered for it. You are told plainly and can still save a copy (FR-075).

### Cross-cutting

- **Launch the application twice.** The second copy refuses to start and points at the first (SC-016).
- **Damage a store file** (truncate it, or overwrite the header bytes). On launch you are told it cannot be opened — **and the file is not modified and no empty store replaces it** (SC-018). Check the file's hash is unchanged.

## 5. Known bounds and gotchas

- **~1 GB per attachment.** SQLite's default `SQLITE_MAX_LENGTH` is 1,000,000,000 bytes and also caps row size. The spec imposes no limit, so this is the practical ceiling; a larger file will fail at the store boundary rather than being silently truncated.
- **Remove the store from a synced folder before measuring anything.** A cloud client rewriting files underneath the application will produce confusing results that look like application bugs.
- **Don't copy the store while the application is running.** This module uses the rollback journal precisely so the single `.db` file *is* the whole store, but copying mid-write is still copying a file being written.
- **A leftover `-journal` file beside the store is not corruption.** It is an interrupted transaction that SQLite recovers on the next open. Nothing in the application should "clean it up".
- **Removable-media detection is best-effort.** Many USB drives report themselves as fixed disks, so the warning can be missed. It is a warning by design, not a guarantee.
- **Every attachment type opens without warning, including executables.** This is deliberate (FR-071). Test only with files you trust.

## 6. When something goes wrong

| Symptom | Likely cause | Where to look |
|---|---|---|
| Rust build fails at link/SQLite | MSVC build tools missing | §1 |
| Application shows the gate forever | No `settings.json`, or the practitioner cancelled | `%APPDATA%\com.har.tax-statements-analysis\settings.json` |
| "Records cannot be reached" | The remembered folder or file is missing, unplugged or renamed | FR-025 — re-choose a location; the store is not lost |
| "Not a store of this application" | The file is not this application's store, or is too damaged to read | FR-059/FR-060 — the file was not modified |
| An attachment will not open | Nothing registered for that file type | FR-075 — save a copy and open it manually |
| A viewer shows a stale file | The temporary copy from this session is being reused | Nothing to fix; the next launch clears it |
