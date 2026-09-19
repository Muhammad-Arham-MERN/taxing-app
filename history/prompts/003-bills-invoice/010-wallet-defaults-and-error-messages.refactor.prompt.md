---
id: 010
title: Wallet Default Values and Visible Validation
stage: refactor
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["bills", "wallets", "validation", "ux"]
links:
  spec: specs/003-bills-invoice/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src/components/bills/CreateBillForm.tsx
 - tax-statements-analysis/src/components/bills/WalletNumbersEditor.tsx
 - tax-statements-analysis/src/components/bills/BillItemsEditor.tsx
 - tax-statements-analysis/src/components/bills/CreateBillForm.test.tsx
 - specs/003-bills-invoice/spec.md
tests:
 - npm test — NOT run (build/test command earlier denied by the user this session)
---

## Prompt

right now the default numbers i asked was not be just in placeholder, they actually are real numbers to be placed there. Then if the user wants they can cut the default number and add a number in place of that or another number themselves

Also regex does not inform if number is not correct, it just disables the button

## Response snapshot

1. **Wallet defaults are real values.** `createEmptyForm()` now starts a new bill with `jazzcashNumbers: [WALLET_PLACEHOLDERS.jazzcash]` and `easypaisaNumbers: [WALLET_PLACEHOLDERS.easypaisa]` — `+923225739614` and `+923125739614` — which the practitioner can clear and replace. They remain the input placeholders too, for when a field is emptied.
2. **Validation now explains itself.** `WalletNumbersEditor` reads its list's per-row errors (`useFormState`) and renders the message under the offending input, so a number that is not in +92 format is explained instead of only disabling the button. The same defect existed for line items, so `BillItemsEditor` now shows the Details and Amount messages under their own inputs as well.

Tests added: new bills start with the two default numbers; a non-+92 wallet number renders the explanatory message. Spec updated (FR-009 and two clarification entries, 2026-09-19).

## Outcome

- ✅ Impact: the practice's wallet numbers arrive filled in, and any invalid entry says what is wrong.
- 🧪 Tests: **not run** — the frontend build/test command was denied earlier in the session, so these changes are unverified.
- 📁 Files: 4 frontend files + the spec.
- 🔁 Next prompts: run `npm run build` and `npm test`; then re-release.
- 🧠 Reflection: the missing message was a rendering gap, not a validation gap — the zod error was being produced all along (the button's disabled state proved it), but the array editors never displayed it because they used `register` rather than a `FormField`.

## Evaluation notes (flywheel)

- Failure modes observed: array-row editors using bare `register` give no field errors; worth remembering for any future repeatable field.
- Graders run and results (PASS/FAIL): not run.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the suite and confirm the two new tests pass.
