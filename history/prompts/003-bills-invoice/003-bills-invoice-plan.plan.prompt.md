---
id: 003
title: Bills and Invoices Implementation Plan
stage: plan
date: 2026-09-18
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: /sp.plan
labels: ["plan", "module-3", "bills", "invoices", "pdf", "sqlite-migration", "schema-v2"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003-bills-invoice/plan.md
 - specs/003-bills-invoice/research.md
 - specs/003-bills-invoice/data-model.md
 - specs/003-bills-invoice/contracts/tauri-commands.md
 - specs/003-bills-invoice/contracts/bill-repository.md
 - specs/003-bills-invoice/quickstart.md
 - CLAUDE.md
tests:
 - none
---

## Prompt

/sp.plan

## Response snapshot

Generated the Module 3 design artifacts. Technical approach: invoice-only additions on top of Modules 1/2 — bills, line items and customers stored in the **same** SQLite store file (schema v1→v2 additive migration), amounts as integer paisa, `STRICT` tables, rollback journal; invoice PDF **rendered on demand in the frontend** with `@react-pdf/renderer` (bytes handed to Rust via raw-body commands for temp+opener and the save dialog); a monotonic `next_invoice_no` counter in `app_meta` allocated inside the create transaction so invoice numbers are unique and never reused; `customers` keyed by `name COLLATE NOCASE` and upserted on bill save; the View Bills list filters by optional date range and optional customer and aggregates `details`/`total` in SQL; Module 2's location-change carry-across extended to customers → bills → items + counter; new frontend `formatPkr` beside the existing `₨` `formatAmount`; four grouped nav tabs with a divider. Wrote `plan.md`, `research.md` (R1–R10, no NEEDS CLARIFICATION), `data-model.md`, two contracts, `quickstart.md`, and ran `update-agent-context.ps1 -AgentType claude` (then tidied the appended lines in `CLAUDE.md`, whose parser had missed the multi-line dependencies field). Constitution Check: PASS with two objections raised (no automated tests on migration/carry; new frontend PDF dependency).

## Outcome

- ✅ Impact: Module 3 is fully planned; ready for `/sp.tasks`.
- 🧪 Tests: none (planning); Vitest coverage to be extended during implementation
- 📁 Files: plan.md, research.md, data-model.md, contracts/tauri-commands.md, contracts/bill-repository.md, quickstart.md, CLAUDE.md
- 🔁 Next prompts: `/sp.tasks`
- 🧠 Reflection: The most easily-missed consequence of "same store" was that the storage-location carry-across must now move customers, bills and line items too, or changing the directory silently drops the billing record; and that opening a pre-existing version-1 store requires an additive migration. Both were surfaced explicitly. ADR candidates: (1) invoice PDF rendered in the frontend with `@react-pdf/renderer`; (2) SQLite schema v1→v2 additive migration and invoice-number counter.

## Evaluation notes (flywheel)

- Failure modes observed: the agent-context script's plan parser only reads single-line fields, so the multi-line Primary Dependencies field was skipped; cleaned up manually.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run `/sp.tasks` to break the plan into tasks.
