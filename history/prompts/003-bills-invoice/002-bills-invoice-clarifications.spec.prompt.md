---
id: 002
title: Bills and Invoices Clarifications
stage: spec
date: 2026-09-18
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: /sp.clarify
labels: ["spec", "module-3", "bills", "invoices", "clarify", "customer-filter", "invoice-numbering"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003-bills-invoice/spec.md
 - specs/003-bills-invoice/checklists/requirements.md
tests:
 - none
---

## Prompt

/sp.clarify

give me all questions to answer at once dont ask one by one

## Response snapshot

Ran the prerequisites check (`003-bills-invoice`), scanned the spec against the ambiguity taxonomy, and presented all five clarification questions at once as requested. Client answers: Q1=A (invoices regenerated on demand, never stored), Q2=A (invoices open in the system's default PDF application), Q3=customers + `View Bills` list columns Customer Name/Date/Details/Amount plus a Customer filter (drop-down of every past customer, also type-to-search) combined with the optional date range and saved in the main store, Q4=A (sequential prefixed invoice numbers `INV-0001`, never reused), Q5=B (customer details remembered and reusable to auto-fill new bills). Encoded all answers into the spec's Clarifications section, Functional Requirements (modified FR-019/027/034/038-040/045; added FR-064–FR-069), User Story 2 (rewritten with the customer filter), Edge Cases, Key Entities (added Customer), Success Criteria (SC-018–SC-021) and Assumptions; updated the checklist notes.

## Outcome

- ✅ Impact: All five clarifications resolved and integrated; spec is internally consistent and ready to plan.
- 🧪 Tests: none (specification work)
- 📁 Files: specs/003-bills-invoice/spec.md, specs/003-bills-invoice/checklists/requirements.md
- 🔁 Next prompts: `/sp.plan`
- 🧠 Reflection: Delivering the questions simultaneously (per the client's request) worked well; the customer-directory answer (Q5:B) added a new Customer entity and triggered the customer-filter requirement the client described inside their Q3 answer.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): all-questions-at-once (client override of one-at-a-time loop)
- Next experiment (smallest change to try): proceed to `/sp.plan`.
