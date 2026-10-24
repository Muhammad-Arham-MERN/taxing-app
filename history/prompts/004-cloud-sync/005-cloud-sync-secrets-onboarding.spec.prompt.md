---
id: 005
title: Cloud Sync Secrets Onboarding
stage: spec
date: 2026-10-15
surface: agent
model: unspecified
feature: 004-cloud-sync
branch: 004-cloud-sync
user: H.A.R
command: /sp.plan
labels: ["spec", "plan", "module-4", "cloud-sync", "credentials", "onboarding", "windows-credential-manager"]
links:
  spec: specs/004-cloud-sync/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/004-cloud-sync/spec.md
 - specs/004-cloud-sync/plan.md
 - specs/004-cloud-sync/research.md
 - specs/004-cloud-sync/data-model.md
 - specs/004-cloud-sync/quickstart.md
 - specs/004-cloud-sync/contracts/tauri-commands.md
 - specs/004-cloud-sync/contracts/cloud-repository.md
 - specs/004-cloud-sync/checklists/requirements.md
 - CLAUDE.md
tests:
 - none
---

## Prompt

one more thing we need to do, we dont package env variables to installer it is not relaible i have a separate idea

What we do is that our current env, i will give this to the partners, and in the onboarding time when a user has not selected their storage, it also checks if environment variables are configured or not, if they are configured good to go, but if they are not a screen opens to them asking them to paste their "Secrets" and then they all are required to just inser the env file, the env file contains all required secrets for application in Windows Credentials Manager, so the app can use it from the credentials manager whenever it is required

The env on paste will be automatically parsed and all required env variables will be extracted, and saved in Windows Credentials Manager Automatically. Application access is not possible without these secrets just like storage directory is required

The application then uses these env variables from Windows Credential Manager

## Response snapshot

Reversed the earlier "credentials shipped in the build" decision and propagated a new secrets-onboarding design across the spec and every plan artefact. Spec: added Clarification Q6, User Story 6 (P1 prerequisite "Set Up Sync on a New Computer"), new Edge Cases, rewrote FR-005 into a setup gate and added FR-044–FR-049 (paste env at onboarding; parse and extract the required set; save to Windows Credential Manager; read from there; reject invalid/incomplete pastes; re-paste to replace), added the "Cloud secrets" and "Setup gate" Key Entities, SC-017–SC-020, and Assumptions ("Secrets are never packaged", "Setup is gated"); replaced the "not configured" outcome with "secrets-unavailable" throughout (FR-012, FR-018, FR-033, SC-009, Sync-outcome entity) and reworded FR-003. Plan: rewrote Summary point 5, Technical Context dependencies (drop `build.rs`; add a credential-store crate) and Storage/Constraints/Scope, Objection 1, structure (removed `build.rs`, added `cloud/secrets.rs`, `commands/onboarding.rs`, `components/onboarding/*`), Complexity Tracking, delivery order step 8, and the Risks. Research: replaced R4 with the onboarding → Windows Credential Manager design and updated R2/R7/R11 and the summary table. Data-model: added the credential store and the setup gate, IPC types `SetupState`/`SecretsPasteResult`, the "Cloud secrets"/"Setup gate" entities, and validation rows. Contracts: added `get_setup_state`/`save_secrets`/`clear_secrets`, a `SetupRepository`, and CS-15–CS-18. Quickstart: prerequisite is now the partner's env file, plus a "Story 6 (prerequisite)" walkthrough and updated troubleshooting. Updated the requirements checklist (iteration 5) and the CLAUDE.md agent-context entries.

## Outcome

- ✅ Impact: The credential mechanism is now runtime onboarding into Windows Credential Manager; the spec, plan, research, data model, contracts, quickstart, checklist and agent context all agree.
- 🧪 Tests: none (spec/plan work; the module remains test-free per the developer's direction).
- 📁 Files: the full `specs/004-cloud-sync/` set plus `CLAUDE.md`.
- 🔁 Next prompts: `/sp.tasks`
- 🧠 Reflection: This is a better design than the build-time token (no secret in the binary) but it makes setup a hard gate for the whole application, not just sync — recorded as Objection 1 with alternatives. The env file becomes a first-class hand-off format, so its parse/validation rules (required keys + specific failure messages) matter and are spelled out. Implementation must keep the secrets out of every file the app writes.

## Evaluation notes (flywheel)

- Failure modes observed: the agent-context script appends plan lines verbatim, so a changed Storage line would duplicate on re-run — hand-edited CLAUDE.md instead.
- Graders run and results (PASS/FAIL): spec quality checklist — PASS (iteration 5); constitution — PASS with three open objections
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the R1 spike, then `/sp.tasks`.
