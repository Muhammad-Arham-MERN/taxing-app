---
id: 003
title: Cloud Sync Dedupe Integrity Rules
stage: spec
date: 2026-10-15
surface: agent
model: unspecified
feature: 004-cloud-sync
branch: 004-cloud-sync
user: H.A.R
command: /sp.specify
labels: ["spec", "module-4", "cloud-sync", "dedupe", "integrity", "edge-cases"]
links:
  spec: specs/004-cloud-sync/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/004-cloud-sync/spec.md
 - specs/004-cloud-sync/checklists/requirements.md
tests:
 - none
---

## Prompt

also a few more edge cases, lets say if computer a sends data to cloud, and lets say the data of local computer has a conflict with main computer which is duplication ,it checks if every sigle item from one to end of that data corresponds with cloud then in that case that data will not be pushed, even if their ids match, if atleast one thing is not same it is saved, but if 100% they are identical and if they contain file their file bytes are identical then that will be reconciled to one only, same goes for cloud pull, if data from cloud is in conflict with data from computer that is like an entry from cloud matches exactly as local then it will be also reconciled to one, so main argument is to keep integirty

## Response snapshot

Encoded the client's content-based dedupe rule into `specs/004-cloud-sync/spec.md`. Changes: Overview now states integrity is judged by content, not identity; Clarifications gained a fifth Q/A; Edge Cases gained three bullets (exact duplicate from either side reconciled to one; near-duplicate differing in one field kept as a change; matching file reference with different bytes is not an exact match); new requirements FR-043 (compare full contents field by field, not by identifier), FR-044 (Push does not re-publish an exact match), FR-045 (Sync does not add an exact match), FR-046 (file bytes must match for an exact match), FR-047 (any differing field means not a duplicate — kept as a change, resolved by FR-019); a new "Exact match (duplicate)" Key Entity; SC-017 (0 exact duplicates ever stored/published) and SC-018 (100% of differing records kept); and a "Duplicate detection by content" assumption. Checklist updated to validation iteration 3.

## Outcome

- ✅ Impact: Module 4 spec now fully covers integrity/dedupe behaviour on both Push and Sync — the client's central requirement ("keep integrity").
- 🧪 Tests: none (specification work; client directed "write no tests")
- 📁 Files: specs/004-cloud-sync/spec.md, specs/004-cloud-sync/checklists/requirements.md
- 🔁 Next prompts: `/sp.plan`
- 🧠 Reflection: This rule sits alongside the last-change-wins rule cleanly: exact content match → collapse to one (no change); any difference → treat as a change and let the newest timestamp win. Worth confirming one nuance with the client — dedupe by content means two genuinely different records that happen to share all field values (e.g. two identical zero-value line entries) would also collapse; if that is undesirable, a stable identity key would be needed, which the client explicitly said not to rely on.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): spec quality checklist — PASS (all items)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): confirm the identical-content-different-entity nuance, then proceed to `/sp.plan`.
