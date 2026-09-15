# Feature Specification: Income & Expenditure Statement Capture and Review (Module 1)

**Feature Branch**: `001-statements-entry-view`
**Created**: 2026-09-13
**Status**: Draft
**Input**: User description: "Income and Expenditure Statement Analysis - Module 1: statement entry and date-range viewing for a single-user offline desktop application"

## Overview

This is the first module of a larger Income and Expenditure Statement Analysis application used by a single person (a tax/accounting practitioner). The module lets that person record individual income and expenditure statements and then review them over any chosen date range, with running totals and a balance.

This specification covers **only the entry and review experience**. The calculation/analytics modules that build on this data, and the rules for how and where data is physically stored, are separate future modules.

## Clarifications

### Session 2026-09-13

- Q: Should Module 1 let the user edit or delete statements that were already recorded? → A: Create & View only — statements are immutable once recorded; editing and deleting are out of scope for this module.
- Q: How should the attached file appear and behave in the View table's File column? → A: Show the file name only, with no open or preview action in this module.
- Q: Which file types and maximum size should an attached statement file allow? → A: Any file type with no size limit, since files are stored locally on the user's machine.
- Q: How should amounts be displayed in the form, table, and totals? → A: Rupee (₨) symbol with thousands separators and two decimal places.
- Q: When the View tab first opens, what default From/To date range should apply? → A: The current calendar month (the 1st of the current month through today).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record an Income or Expenditure Statement (Priority: P1)

The practitioner opens the application, chooses the "Create" tab, and fills in a statement: the date (defaulting to today), whether it is money coming in (In-Flow) or going out (Out-Flow), the nature/category of the transaction, an optional remark, the amount, and an optional supporting file. The "Create" action stays disabled until every required field is filled correctly, after which the statement is recorded.

**Why this priority**: This is the source of all data. Without the ability to capture statements, every other capability has nothing to operate on. It is the minimum viable product on its own.

**Independent Test**: Can be fully tested by completing the form once and confirming a statement is created and becomes visible in the review list; delivers the core value of digital record keeping.

**Acceptance Scenarios**:

1. **Given** the Create tab is open, **When** no fields have been touched, **Then** the date field shows today's date (ISO format) and the Create action is disabled.
2. **Given** the Create tab is open, **When** the user has provided a valid date, type, nature, and amount, **Then** the Create action becomes enabled.
3. **Given** a type has not been chosen, **When** the user looks at the Nature control, **Then** it is disabled and cannot be opened.
4. **Given** the user selected "In-Flow" as the type, **When** they open the Nature control, **Then** only the In-Flow nature options are offered.
5. **Given** the user selected "Out-Flow" as the type, **When** they open the Nature control, **Then** only the Out-Flow nature options are offered.
6. **Given** the user already chose a nature, **When** they change the type, **Then** the previously chosen nature is cleared and the options are repopulated for the new type.
7. **Given** all required fields are valid, **When** the user activates Create, **Then** the statement is recorded and subsequently appears in the review list.
8. **Given** a statement was just created, **When** the form resets, **Then** it returns to its initial state with the date defaulted to today and Create disabled again.

---

### User Story 2 - Review Statements Over a Date Range (Priority: P2)

The practitioner chooses the "View" tab, picks a "From" and a "To" date, and sees every statement whose date falls inside that range listed in a table. Below the table they see the total money in, the total money out, and the resulting balance. Optional values that were never filled in are clearly shown as "None".

**Why this priority**: Recording data is only useful if it can be reviewed. This turns raw entries into an income and expenditure statement for a chosen period and is the reason the application exists.

**Independent Test**: Can be fully tested by creating statements across several dates, filtering to a range, and confirming exactly the in-range statements, their details, and the three totals are correct.

**Acceptance Scenarios**:

1. **Given** statements exist on multiple dates, **When** the user selects a From and To date, **Then** only statements dated within that inclusive range are listed.
2. **Given** a filtered result set, **When** the user reads a row, **Then** it shows the statement's date, type, nature, amount, and its remark and file (or "None" where those were not provided).
3. **Given** a filtered result set, **When** the user views the summary below the table, **Then** they see Total In-Flow, Total Out-Flow, and Balance, where Balance equals Total In-Flow minus Total Out-Flow and may be positive or negative.
4. **Given** statements exist but none fall inside the selected range, **When** the results are shown, **Then** the table communicates that there are no statements for that range and the totals read zero.
5. **Given** the View tab is opened, **When** no range has been chosen yet, **Then** the default range is the current calendar month (the 1st of the current month through today) so the user immediately sees their statements.

---

### User Story 3 - Personalise the Business Header (Priority: P3)

The practitioner opens a Settings control from the header and edits the brand name, office location, and contact numbers. After saving, those details are shown in the application header.

**Why this priority**: The header identifies the practice and its contact details. It is valuable for a professional appearance but is not required for capturing or reviewing statements, so it can follow the two core stories.

**Independent Test**: Can be fully tested by editing each header field, saving, and confirming the header reflects the new values and retains them afterwards.

**Acceptance Scenarios**:

1. **Given** the application is open, **When** the user activates the Settings control in the header, **Then** they can edit the brand name, location, and contact numbers.
2. **Given** the user has edited one or more header fields, **When** they save, **Then** the header immediately shows the updated values.
3. **Given** the user closes and reopens the application, **When** the header renders, **Then** the previously saved brand name, location, and contacts are shown.

---

### Edge Cases

- **Type changed after nature selected**: changing the type clears the chosen nature rather than leaving an option that no longer belongs to the type.
- **Missing optional data**: remarks and files that were never provided must read "None", never blank.
- **Empty result set**: a date range with no matching statements must show a clear empty state with zeroed totals rather than an empty gap.
- **Reversed date range**: when "From" is later than "To", the application communicates that the range is invalid instead of silently showing nothing.
- **Amount edge values**: zero and non-numeric or negative amounts must be handled — the amount must be a valid number and the Create action must stay disabled until it is.
- **Very large amount**: amounts larger than typical must display without truncation or loss of precision.
- **Large result set**: a range covering many statements must remain usable and scroll rather than overflow or slow the experience noticeably.
- **File handling**: any file type and size is accepted because files are stored locally; only one file can be attached per statement.
- **Repeated submission**: activating Create multiple times quickly must not record the same statement more than once.
- **No brand set**: if the business profile has never been customised, the header still renders with a default identity rather than blank fields.

## Requirements *(mandatory)*

### Functional Requirements

**Statement capture**

- **FR-001**: The application MUST provide two tabs, "Create" and "View".
- **FR-002**: The Create tab MUST present a form with a heading "Create Statements" and a horizontal layout.
- **FR-003**: The form MUST include a date field that defaults to the current date and allows the user to pick any date from a calendar.
- **FR-004**: All dates MUST be captured and displayed in ISO format (YYYY-MM-DD).
- **FR-005**: The form MUST include a Type selector offering exactly two options: "In-Flow" and "Out-Flow".
- **FR-006**: The form MUST include a Nature selector that is disabled until a Type is chosen.
- **FR-007**: When Type is "In-Flow", the Nature options MUST be: Fee for Income Tax; Fee for Sales Tax; Fee for PRA | KPRA | SRA | BRA | ETC; Audit Fee; Appeal Fee; Miscellaneous Fee; Loan.
- **FR-008**: When Type is "Out-Flow", the Nature options MUST be: Expenses; Rent; Salaries; Utilities - IESCO | PTCL | Mobile; Stationery; Entertainment; Travelling; Taxes; Office Equipments; Others; Receivable.
- **FR-009**: Changing the Type MUST clear any previously selected Nature and repopulate the options for the new Type.
- **FR-010**: The form MUST include an optional free-text Remarks field.
- **FR-011**: The form MUST include a required numeric Amount field.
- **FR-012**: The form MUST allow the user to optionally attach exactly one file of any type and any size to the statement, since files are stored locally.
- **FR-013**: The Create action MUST remain disabled until the date, type, nature, and amount are all valid.
- **FR-014**: Activating Create MUST record the statement and make it available to the View tab.
- **FR-015**: After a statement is recorded, the form MUST reset to its initial state with the date defaulted to today.
- **FR-016**: The application MUST prevent the same statement from being recorded more than once through repeated rapid submissions.

**Statement review**

- **FR-017**: The View tab MUST let the user choose a "From" date and a "To" date.
- **FR-018**: The View tab MUST list every statement whose date falls within the selected range, inclusive of both boundaries.
- **FR-019**: Each listed statement MUST show its Date, Type, Nature, Remarks, Amount, and File; the File value MUST be the attached file's name, with no open or preview action in this module.
- **FR-020**: Optional values that were not provided MUST be displayed as "None".
- **FR-021**: The View tab MUST display, below the list, a Total In-Flow, a Total Out-Flow, and a Balance.
- **FR-022**: The Balance MUST equal Total In-Flow minus Total Out-Flow and MUST be able to display both positive and negative values.
- **FR-023**: When no statements fall within the selected range, the View tab MUST show a clear empty state and report totals of zero.
- **FR-024**: When the "From" date is later than the "To" date, the application MUST indicate that the range is invalid.
- **FR-032**: Recorded statements MUST be immutable in this module; the View tab MUST NOT offer any edit or delete action.
- **FR-034**: The View tab MUST default to the current calendar month (the 1st of the current month through today) when opened, until the user changes the range.

**Header and settings**

- **FR-025**: The application MUST display a header containing the brand name, location, contact numbers, and a brand logo.
- **FR-026**: The header MUST include a Settings control that lets the user edit the brand name, location, and contact numbers.
- **FR-027**: Saved header customisations MUST be reflected in the header immediately and retained for future sessions.
- **FR-028**: The application MUST render a default identity when the business profile has not been customised.

**Application context**

- **FR-029**: The application MUST operate fully offline on a single user's machine, with all data kept locally.
- **FR-030**: The application MUST support a single user without accounts, sign-in, or user management.
- **FR-031**: The application MUST provide a dark theme by default, consistent across every screen and component.
- **FR-033**: The application MUST display every amount using the rupee (₨) symbol with thousands separators and exactly two decimal places, in the form, the table, and the totals.

### Key Entities *(include if feature involves data)*

- **Statement**: A single recorded financial transaction. Key attributes: date, type (In-Flow or Out-Flow), nature/category, amount, optional remarks, and an optional attached file.
- **Business Profile**: The practitioner's identifying details shown in the header — brand name, office location, and contact numbers. Retained between sessions.
- **Attached File**: An optional supporting document linked to exactly one statement, referenced by the statement's File column.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can record a complete statement in under 30 seconds using only the required fields.
- **SC-002**: When a user picks a date range, matching statements and totals appear in under 2 seconds for a data set of thousands of statements.
- **SC-003**: The displayed Balance always equals Total In-Flow minus Total Out-Flow, matching the listed statements exactly (100% of the time).
- **SC-004**: No statement can be recorded while any required field is missing or invalid (0 accepted incomplete submissions).
- **SC-005**: 100% of optional fields left empty display as "None".
- **SC-006**: Header customisations become visible immediately after saving and persist across restarts (100% retention).
- **SC-007**: 100% of dates shown to the user conform to ISO format (YYYY-MM-DD).
- **SC-008**: A first-time user can locate and open the Create form and the View form without external instructions.

## Assumptions

- **Dependencies**: None external. The application relies only on data the single user enters, runs entirely offline, and does not call any network service or third-party system.
- **Scope boundary**: This module covers only creating and reviewing statements plus header customisation. Editing or deleting a recorded statement, multi-user access, reporting/exports, and the analytics/processing modules are out of scope for this specification.
- **Default identity**: A default brand name, location, and contact details are pre-set so the header is never empty on first launch; these match the details supplied in the feature description.
- **Default review range**: The View tab opens with the current calendar month selected (the 1st of the current month through today), so the user sees data immediately without first choosing dates.
- **Amounts**: Amounts are currency values in Pakistani Rupees (₨), entered and displayed as positive numbers with exactly two decimal places and thousands separators; the meaning of money in or out comes from the Type field.
- **Attachments**: A statement may carry at most one supporting file of any type and any size; files are stored locally on the user's machine, so no type or size limit is imposed.
- **Storage**: How and where data is physically stored is deliberately deferred to a later module. This specification describes only what the user can do and see, not the storage mechanics.
- **Analytics**: Date-based processing, reconciliation, and any further analysis beyond the in-range totals and balance described here are handled by later modules.
