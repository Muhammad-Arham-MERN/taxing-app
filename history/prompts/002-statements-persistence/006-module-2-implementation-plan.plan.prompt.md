---
id: 006
title: Module 2 Implementation Plan
stage: plan
date: 2026-09-14
surface: agent
model: unspecified
feature: 002-statements-persistence
branch: 002-statements-persistence
user: H.A.R
command: /sp.plan
labels: ["plan", "module-2", "rust", "sqlite", "tauri", "research"]
links:
  spec: specs/002-statements-persistence/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/002-statements-persistence/plan.md
 - specs/002-statements-persistence/research.md
 - specs/002-statements-persistence/data-model.md
 - specs/002-statements-persistence/quickstart.md
 - specs/002-statements-persistence/contracts/tauri-commands.md
 - specs/002-statements-persistence/contracts/statement-repository.md
 - CLAUDE.md
tests:
 - none
---

## Prompt

/sp.plan

(No additional free-text input was supplied; the command template was executed against the active feature spec at specs/002-statements-persistence/spec.md.)

## Response snapshot

Ran `setup-plan.ps1 -Json` to scaffold `plan.md`, read the spec, the constitution and Module 1's two contracts, then executed Phase 0 and Phase 1.

**Phase 0 — research.** Three research agents were dispatched in parallel rather than writing from memory, because the plan's correctness hinges on exact crate names, APIs and platform behaviour:

1. **Tauri v2 plugins** — confirmed `tauri-plugin-dialog` for all three pickers, `tauri-plugin-single-instance` (**must be registered first**, no JS API, no capability), `tauri-plugin-opener` (already a dependency; `app.opener().open_path()`), and `settings.json` in `app_config_dir()` in preference to `tauri-plugin-store`. Key finding: **Rust-side calls are not gated by capabilities**, so neither `opener:allow-open-path` nor `dialog:default` is required for this design — a materially smaller IPC surface than expected.
2. **rusqlite for large BLOBs** — `bundled` compiles SQLite from C source (so a **C compiler becomes a build-time prerequisite**); a separate `attachments` table with the blob **last** makes "a range review reads no file contents" a structural property, because SQLite reads overflow pages only when it must advance past the overflowing column; `ZEROBLOB` + incremental blob I/O for chunked copying; `application_id`/`user_version` as the O(1) store marker, with `integrity_check` rejected as a routine check because it scans the whole file.
3. **Windows behaviours** — `GetVolumePathNameW` + `GetDriveTypeW` for drive classification (with the honest caveat that many USB drives report as fixed disks, so it is a heuristic); the Cloud Files sync-root API as the only dependable cloud-folder signal (the OneDrive folder is not a reparse point); per-run temp folders with cleanup tolerating `ERROR_SHARING_VIOLATION`.

All twelve unknowns are resolved in `research.md`; no `NEEDS CLARIFICATION` remains.

**The research changed two design decisions** that would otherwise have been guesses: rollback journal mode instead of WAL (WAL's `-wal`/`-shm` sidecars would make "copy the one file as your backup" false, breaking FR-057/FR-058), and per-statement idempotent carry-across instead of one long transaction (skip-by-identity makes an interrupted copy safely re-runnable, which is what FR-021 and FR-063 jointly require).

**Phase 1 — design.** Produced `data-model.md` (identity stamp, schema DDL, `settings.json`, extended value types, entity lifecycles, a validation-to-FR mapping), two contracts (`tauri-commands.md` replacing Module 1's deferred sketch, `statement-repository.md` extending the seam), and `quickstart.md` (build prerequisites, on-disk locations, a per-story acceptance walkthrough, known bounds). Ran `update-agent-context.ps1 -AgentType claude`, then condensed its verbatim dump of the Storage paragraph into readable entries and corrected the now-stale Module 1 SQLite line.

**Constitution Check: PASS**, with two objections raised rather than acted on — (1) no automated tests covering the module whose entire risk is silent data loss, offered with a minimal-test alternative; (2) the new MSVC build-tools requirement, offered against relying on a system SQLite library.

## Outcome

- ✅ Impact: Module 2 has a researched, decision-complete plan. Every technical unknown is resolved with a stated alternative, and the two decisions that most affect the spec's promises (journal mode, carry-across semantics) were derived from research rather than assumed.
- 🧪 Tests: none added. Constitution Objection 1 records that the highest-risk code in the project will have no automated guard, per the developer's standing direction.
- 📁 Files: plan.md, research.md, data-model.md, quickstart.md, contracts/tauri-commands.md, contracts/statement-repository.md (all created), CLAUDE.md (updated).
- 🔁 Next prompts: `/sp.tasks` to break the plan into tasks. The spec is large (75 FRs, 5 stories), so a decision on whether to deliver it as one module or two may be worth taking first — the natural seam is US1+US2 versus US3–US5.
- 🧠 Reflection: Module 1's deferred contract sketch turned out to be the most useful single input — comparing it against the new spec exposed three places where Module 2 silently reverses it (files as blobs rather than paths, no business-profile persistence, no app-data default location). Those are now explicit supersessions rather than contradictions a reader would have to notice.

## Evaluation notes (flywheel)

- Failure modes observed: `update-agent-context.ps1` pastes the Technical Context values verbatim, producing an unreadable multi-hundred-word bullet in CLAUDE.md; it needed manual condensing, and it leaves the previous module's stale line in place. Worth doing manually after each run.
- Graders run and results (PASS/FAIL): constitution gate — PASS (2 objections recorded, 0 violations); research completeness — PASS (12/12 unknowns resolved, no `NEEDS CLARIFICATION`).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): dispatch the research agents before drafting the plan's Technical Context rather than after — two decisions in the first draft would have been wrong if the research had not contradicted them.
