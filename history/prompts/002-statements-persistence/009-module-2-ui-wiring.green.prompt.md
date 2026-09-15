---
id: 009
title: Module 2 UI Wiring Complete
stage: green
date: 2026-09-15
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.implement
labels: ["implement", "module-2", "frontend", "raw-ipc", "finalize"]
links:
  spec: specs/002-statements-persistence/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src/App.tsx
 - tax-statements-analysis/src/components/providers/DataProvider.tsx
 - tax-statements-analysis/src/components/layout/RevealHeader.tsx
 - tax-statements-analysis/src/components/layout/SettingsDialog.tsx (deleted)
 - tax-statements-analysis/src/components/layout/SettingsDialog.test.tsx (deleted)
 - tax-statements-analysis/src/components/storage/StorageGate.tsx
 - tax-statements-analysis/src/components/storage/StorageLocationDialog.tsx
 - tax-statements-analysis/src/components/statements/EditStatementDialog.tsx
 - tax-statements-analysis/src/components/statements/StatementsTable.tsx
 - tax-statements-analysis/src/components/statements/FileAttachmentField.tsx
 - tax-statements-analysis/src/components/statements/CreateStatementForm.tsx
 - tax-statements-analysis/src/data/repositories.ts
 - tax-statements-analysis/src/data/tauri.ts
 - tax-statements-analysis/src/data/in-memory.ts
 - tax-statements-analysis/src/domain/types.ts
 - tax-statements-analysis/src/domain/identity.ts
 - tax-statements-analysis/src-tauri/src/commands/statements.rs
 - tax-statements-analysis/src-tauri/src/commands/attachments.rs
 - tax-statements-analysis/src-tauri/src/store/statements.rs
 - specs/002-statements-persistence/contracts/tauri-commands.md
 - specs/002-statements-persistence/tasks.md
tests:
 - cargo check (Rust backend) — PASS, exit 0
 - tsc --noEmit (frontend) — PASS, exit 0
 - npm run build (frontend) — PASS, exit 0
 - npm test — FAIL, pre-existing harness break (React.act), ignored by instruction
---

## Prompt

"ignore test fails, just complete ui wiring and finalize"

(Preceded by the developer pointing at two Tauri documentation pages — `calling-rust` and the
opener plugin — and asking me to study them, which corrected a mistake in how attachment
bytes were being sent.)

## Response snapshot

**Two documentation findings, one of which corrected my design.**

1. **Raw request bodies.** Tauri's `invoke(cmd, bytes, { headers })` sends the payload as a
   raw body with everything else in headers, and `InvokeBody::Raw` reads it in Rust. My
   earlier claim that JSON-encoding attachment bytes was "fine because it stays on the Rust
   side" was wrong — it would have inflated a 50 MB scan into ~200 MB of decimal numbers.
   `create_statement` and `update_statement` now take the file as the raw body with the
   statement's fields in an `x-statement-meta` header; `AttachmentAction::Replace` carries
   only the file *name* on the wire.
2. **`get_attachment` was removed entirely.** Nothing needed it — open and save both run
   inside Rust and return no contents — so no file crosses the IPC boundary outbound
   either. That is one fewer command and one fewer seam method, and it closed the last
   place a file could be JSON-encoded.
3. **The opener usage was already the documented one** (`app.opener().open_path(...)` from
   Rust), and calling it from Rust is why no `opener:allow-open-path` capability is needed.

**UI wired and finalised.** The gate, the location chooser (folder or existing file, with
the refusal and warning paths and the bring-across-or-start-fresh choice), the header
control replacing Settings, the edit dialog with keep/remove/replace semantics for the
file, and open/save actions from both the edit dialog and the list. `DataProvider` injects
the Tauri implementations when running under Tauri and the in-memory ones otherwise, which
also keeps `npm run dev` usable without the shell.

**Verified:** `cargo check` exit 0 · `tsc --noEmit` exit 0 · `npm run build` exit 0.

**Test harness:** 15 component tests fail with `React.act is not a function` — a
pre-existing mismatch between React 19.3 and the testing library, proven by `ModeToggle`
failing, a component never touched in this work. The developer's instruction was to ignore
it. Two test files were still touched so the build type-checks: `SettingsDialog.test.tsx`
deleted (its component was removed by FR-053) and `onChanged` added to four
`StatementsTable` renders.

**43 of 55 tasks complete.** The 12 outstanding are the five verification tasks (which need
a live run) and the seven polish tasks.

## Outcome

- ✅ Impact: Module 2 is implemented end to end — a compiling Rust store and a wired UI whose
  attachments never travel as JSON in either direction.
- 🧪 Tests: build-level verification only. **Nothing has been run end to end**: no statement
  has been written to or read from a real store, and the acceptance walkthrough in
  `quickstart.md` §4 is unrun.
- 📁 Files: 16 frontend files created/rewritten, 2 deleted; 3 Rust files revised; contract and
  tasks updated.
- 🔁 Next prompts: `npm run tauri dev`, then walk `quickstart.md` §4 story by story. Fix the
  test harness separately.
- 🧠 Reflection: The developer's two documentation links were worth more than my research
  agent's summary — the agent had the raw-body mechanism and I misread its relevance. Reading
  the primary source corrected it in one step.

## Evaluation notes (flywheel)

- Failure modes observed: my `patched=0` line-based regex silently matched nothing because the
  JSX spanned lines; reading the file and editing precisely was the fix. A shell edit that
  reports zero changes should be treated as a failure, not a no-op.
- Graders run and results (PASS/FAIL): cargo check PASS; tsc PASS; build PASS; task completeness
  PARTIAL (43/55).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a bulk text edit reports 0 replacements,
  stop and read the file rather than adjusting the pattern and retrying blind.
