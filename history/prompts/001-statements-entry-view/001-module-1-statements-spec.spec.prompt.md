---
id: 001
title: Module 1 Statements Spec
stage: spec
date: 2026-09-13
surface: agent
model: unspecified
feature: 001-statements-entry-view
branch: 001-statements-entry-view
user: H.A.R
command: /sp.specify
labels: ["spec", "module-1", "frontend", "statements", "tauri", "react", "shadcn"]
links:
  spec: specs/001-statements-entry-view/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-statements-entry-view/spec.md
 - specs/001-statements-entry-view/checklists/requirements.md
tests:
 - none
---

## Prompt

/sp.specify

We need to prepare this small application. It is for a Income and Expenditure Statement Analysis
It is a simple program

We need to build this software so the user can input all the required data into application, save it and then process it based on dates, we have 2 or 3 modules for this

For this spec we will build only 1st Module:

1. we will use Tauri with Python PyTauri for this approach, we will use PyTauri (https://github.com/pytauri/pytauri) but we will use Tauri (https://v2.tauri.app/start/) with Rust Backend, the Py version is just for future scale not our current need
  - Reason why Tauri is because this application has to be used by one person only, it should be offline, fast, windows based, and should be effecient in processing, tauri fits perfectly better than electron even
  - https://v2.tauri.app/start/ -- Tauri
  - https://github.com/pytauri/pytauri -- PyTauri
  - We will write backend in Rust, just python for future not our requirement
2. We will build our Desktop Application Frontend with ReactJS
3. Data will be stored on User's Computer, and we will use SQLLite

[APP]

The frontend of the app will be like this (and we will use ShadCN UI for our UI Components) and We will use

[Theme: Black and White, Call to Actions like Buttons will be #44cc00 and on-hover will be #38a800 ,Dark is our main go, Theme with nice curvy features, it should have a soft tone with grey touches, be minimalist and elegant UI that is not cluttered]

1. A beautiful page that contains a header with following Details (Use this Navbar https://ground.bossadizenith.me/docs/components/navbars/reveal)
  - Brand name is "M&M Tax Law Solutions"
  - Location is "Office no 8, 1st Floor, Pounch House Complex, Adam Jee Road, Rawalpindi"
  - Contacts are "+92 334-5739614" "+92 312-5739614" "051-5910021"
  - Logo will be Green Colored "M&M Tax Law Solutions" with this green colored Icon lu LuScale (from https://react-icons.github.io/react-icons/search/#q=scale)
The color will be this In-Between Light and Dark Green, not too dark but not too Light (Matches Theme)

2. There should be a header that contains settings button, clicking on it allows to change the location, brand name and contact details

3. Put 2 Tabs, use ShadCN Components for This called "Create" & "View" https://ui.shadcn.com/docs/components/base/tabs

4a. For the "Add" column selected it will open a nice form that is horizontal https://ui.shadcn.com/docs/forms/react-hook-form with following properties
(It should have a heading saying "Create Statements")
  1*. The form should first date input, with Today's Date default and also ShadCN UI to choose date https://ui.shadcn.com/docs/components/base/date-picker (All dates should be in ISO Format)
  2*. Type, this will be a https://ui.shadcn.com/docs/components/base/popover with 2 types "In-Flow" and "Out-Flow"
  3*. Nature, This will also be the same Popover but will be disabled until "Type" is selected, and will be conditional, which is:
  - If "Inflow" type is selected then the Popover items to choose one will be:
     1. Fee for Income Tax
     2. Fee for Sales Tax
     3. Fee for PRA | KPRA | SRA | BRA | ETC
     4. Audit Fee
     5. Appeal Fee
     6. Miscellaneous Fee
     7. Loan
  - if "Out-Flow" Type selected it will have following popover items to choose one
     1. Expenses
     2. Rent
     3. Salaries
     4. Utilities - IESCO | PTCL | Mobile
     5. Stationery
     6. Entertainment
     7. Travelling
     8. Taxes
     9. Office Equipments
     10. Others
     11. Receivable
  4. Remarks, This field will be a normal input field https://ui.shadcn.com/docs/components/base/input (Optional)
  5*. Amount, This will be a number input field same input field component
  6. A file upload icon that can be used to upload files related to the particular item https://ui.shadcn.com/docs/components/base/input (file type) (Optional)
  7. Finally a Create button will appear https://ui.aceternity.com/components/noise-background
  8. The Submit will be disabled until or unless all the fields required (marked *) are not complete

4b. For the "View" Column:
  1. The user will be shown 2 calendars "From" and "To" same shadcnUI Calendar Component
  2. Then all the statements that were created by User will be displayed in table https://ui.shadcn.com/docs/components/base/data-table
  3. the data table will have following all the statements created by user within that date range and will be displayed following details:
   - Date: The date of that statement
   - Type: Type of the statement inflow or outflow
   - Nature: Of the many types, the selected type that the user chose and stored will be dispalyed here
   - Remarks: The Remarks user entered for this
   - Amount: Amount the user entered for this statement
   - File: The file User uploaded for this, it will display the file that was used
   - All the optional fields like Remarks, File if not added will be said "None"
5. At the end of table will be shown "Total In-Flow", "Total Out-Flow" and "Balance (which is Inflow-Outflow can be -ve or +ve)"


That is it for the frontend, that is our current implementation plan, i know a lot of things will not make sense unless the few backend resources are not established, but again we will implement that in a separate spec, right now we just focus on frontend and not the logic of how and where data will be stored etc

Again being strict, dont implement anything backend/processing logic related, i will guide that for you afterwards later

Important Links
https://ui.shadcn.com/docs
https://magicui.design/docs
https://ui.aceternity.com/
https://ground.bossadizenith.me/docs

## Response snapshot

Created feature branch `001-statements-entry-view` and wrote the Module 1 specification at `specs/001-statements-entry-view/spec.md`, covering three prioritised user stories (create a statement; review statements over a date range with totals and balance; personalise the business header), 31 functional requirements, edge cases, key entities, measurable success criteria, and documented assumptions. Generated the spec quality checklist at `specs/001-statements-entry-view/checklists/requirements.md` — all items pass with no [NEEDS CLARIFICATION] markers. Technology choices (Tauri/Rust, React, local SQLite, ShadCN) were deliberately excluded from the spec and deferred to `/sp.plan`, and storage/analytics logic was kept out of scope per the user's instruction.

## Outcome

- ✅ Impact: Module 1 specification authored and validated; feature branch created.
- 🧪 Tests: none (specification artifact only)
- 📁 Files: specs/001-statements-entry-view/spec.md, specs/001-statements-entry-view/checklists/requirements.md
- 🔁 Next prompts: `/sp.clarify` to resolve open questions, then `/sp.plan` for architecture; later `/sp.tasks`.
- 🧠 Reflection: The feature description packed heavy technology detail (Tauri, React, ShadCN, colors); the SpecKit workflow requires these to live in the plan, so they were captured as environment-level context and routed to `/sp.plan` rather than baked into requirements.

## Evaluation notes (flywheel)

- Failure modes observed: `create-new-feature.ps1` failed on Windows PowerShell 5.1 because it uses 4-argument `Join-Path` (PowerShell 6+ only), so it created the branch and spec file but skipped the `history/prompts/...` directory; recovered by creating the PHR directory agent-natively.
- Graders run and results (PASS/FAIL): spec quality checklist — PASS (all items).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Patch the powershell feature script to use `-AdditionalChildPath` guarded by edition detection, or chain `Join-Path` calls, so it runs cleanly on PS 5.1.
