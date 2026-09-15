# Feature Specification: Local Statement Persistence and Editing (Module 2)

**Feature Branch**: `002-statements-persistence`
**Created**: 2026-09-14
**Status**: Draft
**Input**: User description: "Establish the backend persistence layer in Rust/Tauri and connect it to the frontend: store each statement (date, type, nature, amount, remarks and the attached file) in a fully offline local SQL database, retrieve statements by date range for the View tab, and let the user edit saved statements, including replacing or removing their attached file. The Settings control is removed from the frontend and replaced by a 'Choose Storage Directory' control that opens the file system, lets the user choose any directory they desire, and creates the backend SQL file there."

## Overview

This is the second module of the Income and Expenditure Statement Analysis application. Module 1 delivered the Create and View screens but deliberately stored nothing — every statement vanished when the application closed. This module makes the practitioner's records **durable**: statements entered on the Create tab are written to a local SQL store file and come back, unchanged, whenever the View tab is opened again, in a later session or on a later day.

The practitioner decides **where those records physically live**. The header's existing Settings control is removed and replaced by **Choose Storage Directory**. On very first use the application asks for a directory before anything else and stays unusable until one is chosen — working in the application is impossible until the practitioner has said where their data belongs. If they later point the application at a different directory, their records are carried across into a new store file there so nothing is left behind; that happens again on every subsequent change of directory.

It also gives the practitioner **correction ability**. A statement entered with a wrong date, type, nature, amount or remark — or with the wrong attachment — can be opened from the View tab, corrected and saved in place, including swapping the attached file for a different one or removing it altogether. This deliberately reverses Module 1's "statements are immutable" rule, which was a scoping decision taken only because Module 1 had no storage.

The application **remains fully offline**. All data — every field and the complete contents of every attached file — stays in the practitioner's own store file, with nothing installed or administered separately and nothing transmitted anywhere. An important consequence of keeping whole files in the store is that **a date-range review must not drag file contents along with it**: the View tab needs the statements and their file *names*, and a file's contents are only fetched when one specific statement's file is actually wanted. That keeps reviewing a period fast no matter how much evidence is attached to it.

This specification describes what the practitioner can do and observe; how the store is provisioned and driven belongs to the plan, not here.

## Clarifications

### Session 2026-09-14

- Q: You specified PostgreSQL, but the app must stay fully offline with no separate setup. How should the local database actually be provided on the practitioner's machine? → A: A single self-contained local SQL file (SQLite), with no separate installation, no server process and no administration. This also reconciles with Module 1's plan, which had already recorded SQLite as the intended store. *Where that file is created is settled by the storage-directory questions below.*
- Q: Module 1 allowed attachments of any type and any size. Does that limit change now that file contents are kept inside the store? → A: Keep **no size limit**. The developer's reasoning: the View tab displays file *names* only, and file contents are supplied only on request, so loading every file's contents with a list would bloat the data unnecessarily. The requirement that follows is that a range review never transports file contents.
- Q: Is persisting the header details (brand name, location, contacts) in scope? → A: No. Those details stay as they are and **cannot be updated**, so there is nothing to store for them. The header control that previously edited them is removed (amended below).
- Q: Where should the store file live — an application-managed data folder, or somewhere the practitioner picks? → A: The practitioner picks. The header's Settings control is removed and replaced by **Choose Storage Directory**, which opens the file system so they can choose any directory they desire, and the store file is created there. *(Raised after the header answer above, and it amends that answer rather than replacing it: the brand name, location and contacts still cannot be edited — the control that edited them is simply replaced by the storage-directory control.)*
- Q: On the very first run, before any directory has been chosen, what should happen? → A: **Prompt, and the practitioner must browse and choose a directory.** They cannot use the software at all until a directory is selected — nothing on the frontend is available before that.
- Q: The practitioner already has statements saved and then chooses a different directory. What happens to those statements? → A: The application takes the data out of the previously used store, creates a new store file in the newly chosen directory, and pushes all of that previous data into it, so the practitioner continues with the same records in the new location. The same process happens again on every subsequent change of directory.
- Q: What should happen if the practitioner opens the application a second time while it is already running? → A: The second copy refuses to start and tells the practitioner to use the copy that is already running. Only one copy may use the store at a time.
- Q: Which folders should the practitioner be allowed to choose as the storage directory? → A: Any folder they desire, but when the chosen folder is cloud-synced, on a network share or on removable media, the application warns before accepting it — explaining that the records would leave this machine or could become unreachable — and proceeds only once the practitioner confirms.
- Q: The store file exists but cannot be opened because it is damaged or corrupted. What should the application do? → A: Report it plainly and leave the file completely untouched — no automatic repair, no partial recovery, and no empty store put in its place.
- Q: After the records are carried across to a newly chosen directory, what should happen to the store file they came from? → A: Leave it exactly where it is, untouched. Only one store is ever in use, but the old file is never deleted.
- Q: The practitioner already has a store in use and then chooses an existing store file to work with. What happens to the records in the file they were using? → A: The data from the store in use is copied across and added into the newly chosen file, which then becomes the working file.
- Q: Should the application work on a chosen store file where it is, or on a copy? → A: Use it where it is. The chosen file becomes the working store and its folder becomes the storage directory.
- Q: When records are carried into a store that already holds records, what happens to statements already present? → A: The developer identified a flaw in an unconditional carry-across and refined the rule: the carry-across is **not** automatic. Whenever the practitioner points the application at a new location while records are in use, they are asked whether to bring the previous records into it or to start fresh without them. Carrying records in remains the option they described, and starting fresh now covers deliberately dropping the old data.
- Q: Opening an attachment requires writing it to disk so another program can display it. How should those temporary copies be managed? → A: Written to a folder the application manages, kept separate from the store, and cleared the next time the application starts — so nothing accumulates and a viewer still holding a file open is never disturbed.
- Q: Attachments can be any file type. How should types that run code when opened be handled? → A: **Open anything, always.** Every attachment goes to the system's handler with no exception and no warning from the application. The developer was shown that a program, script or shortcut attached by mistake — or received from a client — will run with their privileges on a single click, and chose this deliberately. The decision and its consequence are recorded in the Assumptions so it is neither re-litigated nor quietly softened.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Statements Survive Closing the Application (Priority: P1)

The practitioner opens the Create tab, records statements through the day — some with a supporting file attached — and closes the application. The next morning they reopen it, choose the View tab, pick the date range, and find every statement exactly as it was left: same date, type, nature, amount, remarks and file name, with the same income, expenditure and balance totals. Reviewing that period is as quick as it was the day before, even though several statements in it carry substantial attachments.

**Why this priority**: This is the entire reason the module exists. Without durable storage every other capability is built on sand and the practitioner's bookkeeping would have to be redone at every launch. Durable capture and range retrieval on their own already turn the application into a usable record-keeping tool, so this story is a viable product by itself.

**Independent Test**: Can be fully tested by recording a statement (including one with an attachment), closing and reopening the application, and confirming the statement and its totals are still present for a range covering its date. A storage location must already have been chosen (see US2), which is the only prerequisite.

**Acceptance Scenarios**:

1. **Given** the Create tab is open, **When** the practitioner records a valid statement, **Then** the statement is written to the store file and only then reported as saved.
2. **Given** a statement has been recorded, **When** the application is closed and reopened, **Then** the statement appears in the View tab for a range covering its date, with identical date, type, nature, amount, remarks and file name.
3. **Given** stored statements span many dates, **When** the practitioner selects a From and a To date, **Then** exactly the statements dated within that inclusive range are listed, newest first.
4. **Given** a range review is displayed, **When** the practitioner reads a row, **Then** they see the attached file's name where one exists, and nothing has been loaded for the files themselves.
5. **Given** a statement was recorded with an attached file, **When** that one statement's file is requested, **Then** its contents are returned complete and identical to the file that was attached.
6. **Given** a retrieved result set, **When** the practitioner reads the summary, **Then** Total In-Flow, Total Out-Flow and Balance are computed from the retrieved statements only, and Balance equals Total In-Flow minus Total Out-Flow.
7. **Given** the machine has its network connection disabled, **When** the practitioner records and views statements, **Then** every operation works exactly as it does with a connection.
8. **Given** a statement could not be stored, **When** the create attempt finishes, **Then** the practitioner is told it was not saved and the form does not behave as though it succeeded.

---

### User Story 2 - Choose and Move Where Statements Are Stored (Priority: P2)

The practitioner launches the application for the first time and is asked, before anything else, where their records should be kept. They browse to a directory they want and choose it; only then do the Create and View screens become usable, and the store file appears in the directory they picked. Later they decide their records should sit somewhere else — a different drive, a folder they back up — so they open **Choose Storage Directory** in the header, pick the new directory, and carry on working with all their existing statements now living there.

**Why this priority**: It gates everything. The application refuses to record or review anything until a location has been chosen, so it is the first thing the practitioner must do, and it is what gives them custody of where their financial records physically sit and of how they get them back. It sits at P2 rather than P1 only because on its own it produces no bookkeeping value — its purpose is to enable US1 and to make the records reachable for the journeys that follow.

**Independent Test**: Can be fully tested by launching on a clean machine, confirming no other capability is available until a location is chosen, choosing a directory and confirming the store file appears there, recording a statement, then pointing the application at a second location and confirming the records followed.

**Acceptance Scenarios**:

1. **Given** the application has never been used, **When** it starts, **Then** it asks the practitioner where their records should live, offering both a directory for a new store and an existing store file they may already hold, with nothing pre-chosen for them.
2. **Given** the practitioner is being asked where their records should live, **When** they have not yet chosen, **Then** no statement can be recorded, reviewed or edited.
3. **Given** the practitioner browses to a directory and chooses it, **Then** the store file is created inside that directory and the rest of the application becomes available.
4. **Given** the practitioner chooses an existing store file instead of a directory, **Then** that file becomes the store in use, the folder holding it becomes the storage location, and the records inside it are available.
5. **Given** a storage location has been chosen, **When** the application is closed and reopened, **Then** it opens that same store without asking again.
6. **Given** the practitioner has statements stored and activates "Choose Storage Directory" in the header, **When** they choose a different directory and choose to bring their records, **Then** a new store file is created there, every stored statement and attached file is carried into it, and they continue working with the same records.
7. **Given** the practitioner has statements stored, **When** they choose a new location and choose to start fresh, **Then** that location becomes the store in use carrying none of the previous records, and the store file they came from is left untouched.
8. **Given** the practitioner chooses a new location a second time, **Then** they are asked the same question again, always about the records in use at that moment.
9. **Given** the practitioner points the application at a file that is not a store of this application, **Then** it is rejected with a clear explanation, left completely untouched, and the store in use is unchanged.
10. **Given** the practitioner opens the chooser and then cancels it, **Then** the store in use and all of its data are left exactly as they were.
11. **Given** the practitioner chooses a location that cannot be written to, **When** the choice is made, **Then** the application explains the problem and keeps using the location already in use.
12. **Given** the remembered storage location cannot be reached when the application starts, **When** the practitioner looks at the application, **Then** they are told their records cannot be reached and asked to choose again, and no empty store is started in its place.
13. **Given** the header is displayed, **Then** it offers "Choose Storage Directory" and no longer offers Settings.

---

### User Story 3 - Correct a Saved Statement (Priority: P3)

Reviewing a date range, the practitioner spots a mistake — the amount was mistyped, the nature was wrong, or the wrong receipt was attached — or simply wants to attach a file that was missing at entry time. They open that statement from the list, change the fields that need changing, replace the attached file (or remove it), and save. The list and the totals immediately reflect the corrected statement, and the correction is still there after a restart.

**Why this priority**: Real bookkeeping always needs corrections, and Module 1's refusal to allow them was a limitation of that module rather than a practitioner preference. It is the lowest of the three because it only becomes meaningful once statements persist and a directory has been chosen.

**Independent Test**: Can be fully tested by recording a statement, reopening it from the View tab, changing its fields and its attached file, saving, and confirming the stored statement — but no duplicate — carries the new values across a restart.

**Acceptance Scenarios**:

1. **Given** a stored statement is listed in the View tab, **When** the practitioner opens it for editing, **Then** every field is editable and prefilled with the stored values, including the attached file's name.
2. **Given** the practitioner changes the date, type, nature, amount or remarks and saves, **Then** the existing statement is updated in place — it keeps its identity and no additional statement is created — and the list and totals show the new values.
3. **Given** the practitioner removes the attached file and saves, **Then** the statement is stored with no file and its File column reads "None".
4. **Given** the practitioner replaces the attached file with a different file and saves, **Then** the statement stores the new file and its name, and the previous file is no longer attached to it.
5. **Given** the practitioner edits a statement and abandons the edit, **Then** the stored statement remains exactly as it was before the edit was opened.
6. **Given** an edit leaves the statement invalid, **When** the practitioner looks at the form, **Then** the save action is unavailable and nothing is written to storage.
7. **Given** the practitioner changes the statement's type while editing, **Then** any nature that does not belong to the new type cannot remain selected.
8. **Given** an edit changes the statement's date so that it falls outside the range currently displayed, **When** the edit is saved, **Then** the statement leaves the listed results and the totals are recalculated without it.
9. **Given** an edit touches only fields other than the file, **When** the edit is saved, **Then** the attached file is still returned unchanged and complete when requested.
10. **Given** a saved statement was corrected, **When** the application is closed and reopened, **Then** the corrected values are what the practitioner sees.

---

### User Story 4 - Recover Records From a Backup File (Priority: P4)

The practitioner's machine dies. Somewhere they had kept a copy of the application's store file — an external drive, a backup folder, another machine. Windows is reinstalled, the application is installed again, and on first launch, instead of accepting a new empty store, they point the application at the store file they saved. The application confirms it really is their file, accepts it, and their statements, attachments and totals are back exactly as they were — with the folder they restored from now being where the records live.

**Why this priority**: It is the highest-stakes journey in the module, because it is the difference between a bookkeeping archive that survives a disaster and one that does not, and it is also the rarest — exercised only after a failure or a deliberate move, and entirely enabled by the prompt in US2. It therefore sits below the journeys the practitioner needs routinely.

**Independent Test**: Can be fully tested by copying a store file to a second folder, removing the application's remembered location so it behaves like a fresh installation, pointing the application at the copied file, and confirming every statement, attachment and total it held is present.

**Acceptance Scenarios**:

1. **Given** a fresh installation, **When** the practitioner is asked where their records should live, **Then** they can choose an existing store file instead of a directory for a new store.
2. **Given** the practitioner chooses a store file they saved earlier, **Then** the application accepts it and every statement, attached file and total it holds is available in the View tab.
3. **Given** an accepted store file, **When** the practitioner looks at the header, **Then** the storage location is the folder that file sits in.
4. **Given** the practitioner chooses a file that is not a store of this application, **Then** it is rejected with a clear explanation of why, left completely untouched, and they can choose again.
5. **Given** the practitioner chooses a store file that is damaged, **Then** it is reported as unreadable and left completely untouched.
6. **Given** the practitioner chooses a store file that holds no statements, **Then** it is accepted and they can begin recording into it.
7. **Given** the practitioner already had a store in use, **When** they choose a store file holding other records, **Then** they are asked whether to bring their current records into it or to start fresh from the file as it stands.

---

### User Story 5 - Open or Save an Attachment (Priority: P5)

Reviewing a date range, the practitioner sees that a statement has a receipt attached and wants to check it against the amount. They click the file name, and the document opens in the program they normally use for that kind of file — their PDF reader, their image viewer, their spreadsheet program — with the name they gave it. If they need the file outside the application, they save a copy to a folder of their choosing.

**Why this priority**: It is the most frequently used of the non-core journeys, but the least load-bearing — it depends entirely on the ability to fetch a single attachment, which the module already provides, and nothing else depends on it. Recording, storing, reviewing and correcting statements all work without it.

**Independent Test**: Can be fully tested by attaching a PDF, an image and a spreadsheet to statements, clicking each and confirming it opens in the system's usual application with the right name and contents, then saving a copy elsewhere and confirming it is identical to what was attached.

**Acceptance Scenarios**:

1. **Given** a statement with an attachment is listed, **When** the practitioner clicks the file name, **Then** the attachment opens in the application their system uses for that kind of file.
2. **Given** the practitioner is editing a statement that has an attachment, **When** they open it, **Then** the same thing happens.
3. **Given** an attachment of any type, **When** it is opened, **Then** it goes to the system's handler for that type, with no exception made by the application.
4. **Given** an attachment is opened, **Then** the copy handed to the system is complete, identical to what was attached, and carries the attachment's original name and extension.
5. **Given** the practitioner chooses to save a copy of an attachment, **Then** the system's save prompt appears with the original name offered, and the saved file is identical to the stored one.
6. **Given** a copy has been saved elsewhere, **Then** the stored attachment and its statement are unchanged, and the application does not start managing the copy.
7. **Given** an attachment could not be opened — the system has nothing that handles that kind of file, or it could not be written out — **Then** the practitioner is told plainly and can still save a copy instead.
8. **Given** temporary copies were left behind from an earlier session, **When** the application starts again, **Then** they are cleared away and do not accumulate.

---

### Edge Cases

- **Cancelling before ever choosing**: if the practitioner dismisses the very first request, the application stays unavailable; nothing else can be done until a location is chosen.
- **No location, no work**: there must be no path by which a statement is recorded, reviewed or edited before a storage location has been chosen.
- **Choosing the location already in use**: the store is simply left where it is; no records are moved and nothing is lost.
- **Choosing a directory that already holds a store**: the existing records there are adopted rather than overwritten, so picking a folder that was used before brings back the records it holds instead of destroying them.
- **Pointing at the wrong file**: a file that is not a store of this application — a document, a foreign database, or a damaged file — is rejected with a clear explanation of why and left completely untouched.
- **Choosing an empty store file**: a valid store file holding no statements is accepted, so the practitioner can deliberately begin from an empty file they chose.
- **A store file this version cannot read**: a store written in a shape the application does not understand is reported as unreadable rather than opened in a half-working state.
- **Choosing a store file that cannot be written to**: if the file is open in another program, sits on read-only media or the practitioner lacks permission, it is not accepted; they are told why and the store in use is unchanged.
- **Carrying records into a store that already holds some**: a statement already present in the destination is not added a second time and is not altered there, so a carry-across can never duplicate or overwrite records — and therefore can never inflate the totals.
- **Starting fresh deliberately**: when the practitioner chooses to start fresh, the previous records exist only in the store file they came from. Nothing is deleted and the application must not present them as lost.
- **Directory becomes unreachable**: if the store's directory disappears (drive unplugged, folder renamed or deleted, permissions changed), the practitioner is told plainly and asked to choose again — an empty store must never quietly take its place.
- **Unwritable directory**: a directory the application cannot write to is rejected with an explanation, and the store already in use continues to be used.
- **Store cannot be opened**: if the store cannot be opened or written to (missing, moved or locked), the practitioner gets a clear message and no operation silently appears to succeed.
- **Damaged store file**: a store file that exists but cannot be opened because it is damaged is reported plainly, left completely untouched, and never replaced by an empty store — no automatic repair and no partial recovery are attempted.
- **Interrupted carry-across**: if the move to a new directory is interrupted, no statement or attached file may be lost, and the store the practitioner was using must remain usable.
- **Very large carry-across**: moving a store holding thousands of statements and large attachments must complete without losing or truncating anything.
- **Interrupted write**: if the application or the machine stops mid-save, no half-written statement may ever appear — a statement is either stored completely or not at all.
- **Repeated submission**: activating Create several times quickly must still store exactly one statement.
- **Unusual attachment types**: a PDF, spreadsheet, image or any other file type must be stored and returned unchanged, since the practitioner is free to attach whatever evidence they have.
- **Very large attachment**: an unusually large attachment must be stored and returned intact with no size limit, and must not slow down reviewing the period it belongs to — it is simply never loaded as part of a range review.
- **No attachment at all**: statements recorded without a file must remain valid, must read "None" in the File column, and must never trigger a file request.
- **No application for the type**: if the system has nothing that opens that kind of file, the practitioner is told plainly and can still save a copy to disk instead.
- **A type that runs code**: an attachment that is a program, script or shortcut opens through the system's handler exactly like any other file. The developer chose this deliberately, having been shown the consequence; the application adds no warning of its own.
- **Very large attachment being opened**: writing the copy out must not freeze the application, and a large attachment must open as reliably as a small one.
- **The same attachment opened twice**: the copy already written out is reused rather than piling up duplicates.
- **Temporary folder unavailable or full**: if the copy cannot be written out, the practitioner is told and the store is left untouched.
- **Clean-up after a crash**: copies left behind by an unexpected stop are cleared the next time the application starts.
- **A viewer still holding the file**: a temporary copy is never deleted out from under an application that is still using it.
- **Saving over an existing file**: naming and overwriting are handled by the system's own save prompt; the application never silently overwrites anything.
- **Store not reachable when a file is opened**: the attachment cannot be fetched, and that is reported rather than an empty or partial file being handed to the system.
- **File replaced more than once before saving**: only the last selected file may end up attached.
- **File removed, then the edit abandoned**: the original file must still be attached to the stored statement.
- **Amount edits**: editing the amount to zero, negative or non-numeric must be rejected exactly as it is on creation.
- **Date change across the range boundary**: moving a statement's date in or out of the displayed range must add or remove it from the list and adjust the totals accordingly.
- **Very large stored data set**: a range query over thousands of stored statements must stay usable rather than visibly slowing the application.
- **Reversed range**: a From date later than the To date is still reported as invalid rather than showing an empty result.
- **Restart with an edit in progress**: an edit that was never saved must not alter the stored statement.
- **Cloud-synced, network or removable folder**: the practitioner is warned before such a folder is accepted, so the store never begins leaving the machine or becoming unreachable without them having been told.
- **Private by default**: statement data and attached files stay in the practitioner's own store file and are never exposed to another machine or service — unless the practitioner knowingly chose a cloud-synced, network or removable folder after being warned (FR-055).
- **Application opened twice**: a second copy of the application must not open the store at all; it refuses to start and points the practitioner at the copy already running, so two writers can never share the one store file.
- **Header not customisable**: the brand name, location and contacts continue to show their built-in values; no action in the application can change or store them.

## Requirements *(mandatory)*

### Functional Requirements

**Durable capture**

- **FR-001**: Activating Create MUST write the statement to durable local storage, and the save MUST NOT be reported as successful until that write has completed.
- **FR-002**: Each stored statement MUST retain every value the practitioner entered: date, type, nature, amount, optional remarks, and the optional attached file.
- **FR-003**: The complete contents of the attached file, together with its original file name, MUST be stored as part of the statement, for any file type the practitioner selects and at any size.
- **FR-004**: Stored statements MUST survive the application being closed and reopened, and MUST survive a restart of the practitioner's machine.
- **FR-005**: An interrupted write MUST NOT leave a partially stored statement; a statement MUST be either stored completely or not stored at all.
- **FR-006**: When a statement cannot be stored, the practitioner MUST be informed that it was not saved, and the Create form MUST NOT reset or otherwise behave as though the save succeeded.
- **FR-007**: Repeated rapid activation of Create MUST still result in exactly one stored statement (carried over from Module 1 FR-016).

**Offline and local operation**

- **FR-008**: The application MUST keep all statement data and all attached file contents on the practitioner's own machine and MUST NOT itself copy, upload or place them anywhere else. Where a cloud-synced, network or removable folder has been knowingly chosen under FR-055, the records' location is the practitioner's own decision rather than the application's.
- **FR-009**: The application MUST NOT transmit statement data or attachments to any network service, and MUST perform every operation with the machine's network connection disabled.
- **FR-010**: The application MUST remain usable by a single practitioner on a single machine, with no accounts, sign-in or user management.
- **FR-011**: The application MUST keep every stored statement and every attached file in a single self-contained local SQL file, and MUST NOT require the practitioner to install, configure, start or administer any separate database or server.
- **FR-012**: Statement data and attached files MUST require no password or secret beyond the practitioner's own machine account to be accessed, and the application MUST NOT itself make them readable from another machine.

**Choosing and moving the storage location**

- **FR-013**: The first time the application is used, and before any statement can be recorded, reviewed or edited, it MUST ask the practitioner where their records should live, offering both a directory in which a new store will be created and an existing store file they may already have.
- **FR-014**: The request MUST open the machine's file system so the practitioner can browse to and choose the directory or the store file they desire; neither may be pre-chosen on their behalf.
- **FR-015**: The application MUST make no other capability available until a storage location has been chosen; recording, reviewing and editing MUST all remain unavailable before that point.
- **FR-016**: When a directory is chosen, the store file MUST be created inside it.
- **FR-017**: The chosen location MUST be remembered so that later launches open the same store without asking again.
- **FR-018**: The header MUST replace its Settings control with a "Choose Storage Directory" control that opens the same chooser at any time. Module 1's Settings control (Module 1 FR-026) is superseded and MUST NOT remain.
- **FR-019**: When the practitioner points the application at a new storage location while a store is already in use, the application MUST ask whether the records from the store in use should be brought into the new location or whether the new location should start fresh without them, and MUST act on that choice.
- **FR-020**: When the practitioner chooses to bring them, every stored statement and every attached file MUST be carried into the new store, which then becomes the store in use; when the practitioner chooses to start fresh, the new location MUST become the store in use carrying none of the previous records. The same choice MUST be offered again on every subsequent change of location, always taking the records from the store in use at that moment.
- **FR-021**: An interrupted carry-across MUST NOT lose any statement or attached file, and MUST leave the store the practitioner was using in a usable state.
- **FR-022**: Changing the storage location MUST NOT delete the previously used store file.
- **FR-023**: When the chosen location cannot be written to, or cannot be used for the store, the application MUST explain the problem and keep using the location already in use.
- **FR-024**: When the practitioner cancels the chooser, the store in use and all of its data MUST be left unchanged; if no location has been chosen yet, the application MUST remain unavailable for other work.
- **FR-025**: When the remembered storage location cannot be reached at start-up, the application MUST tell the practitioner and MUST NOT start an empty store in its place.
- **FR-026**: When the chosen location already contains a store, the application MUST adopt the records it holds rather than overwrite them.

**Range retrieval for the View tab**

- **FR-027**: The View tab MUST retrieve stored statements whose date falls within the selected From and To range, inclusive of both boundaries.
- **FR-028**: Each retrieved statement MUST return the stored date, type, nature, amount, remarks and attached file name exactly as they were saved.
- **FR-029**: A range review MUST NOT load or return attached file contents; only the statements' values and their file names may be transported.
- **FR-030**: A range review MUST remain fast regardless of the number and size of the attachments belonging to the statements it lists, because no file contents are loaded for it.
- **FR-031**: Retrieved statements MUST be listed newest first, with statements sharing a date ordered by the order in which they were recorded.
- **FR-032**: The View tab MUST compute Total In-Flow, Total Out-Flow and Balance from the retrieved statements only, with Balance equal to Total In-Flow minus Total Out-Flow.
- **FR-033**: When the selected range contains no statements, the View tab MUST show the empty state and report totals of zero.
- **FR-034**: When the From date is later than the To date, the application MUST report the range as invalid and return no statements.
- **FR-035**: Retrieving a range MUST complete fast enough that the practitioner sees results promptly, including for a data set of thousands of statements.
- **FR-036**: The contents of an attached file MUST be obtainable on demand for one specific statement, complete and unchanged from what was attached.
- **FR-037**: Requesting one statement's attached file MUST NOT load the contents of any other statement's attached file.

**Editing stored statements**

- **FR-038**: The View tab MUST allow the practitioner to open any listed statement for editing, with all of its stored values prefilled.
- **FR-039**: While editing, the practitioner MUST be able to change the date, type, nature, amount and remarks.
- **FR-040**: While editing, the practitioner MUST be able to remove the attached file from the statement.
- **FR-041**: While editing, the practitioner MUST be able to replace the attached file with a different file.
- **FR-042**: Saving an edit MUST update the existing statement in place and MUST NOT create an additional statement.
- **FR-043**: Saved edits MUST persist across restarts of the application and of the machine.
- **FR-044**: While editing, the same validity rules as creation MUST apply, and the save action MUST remain unavailable until the statement is valid.
- **FR-045**: Changing the type while editing MUST clear any nature that does not belong to the newly chosen type.
- **FR-046**: The practitioner MUST be able to abandon an edit, leaving the stored statement exactly as it was.
- **FR-047**: Saving an edit that does not change the attached file MUST leave the stored file unchanged and complete.
- **FR-048**: After a saved edit, the View list and totals MUST reflect the new values, and a statement whose date moved outside the displayed range MUST no longer be listed.
- **FR-049**: When an edit cannot be saved, the practitioner MUST be informed and the stored statement MUST remain unchanged.
- **FR-050**: This module MUST NOT provide any way to delete a stored statement; only the statement's attached file can be removed.

**Preserved and amended Module 1 behaviour**

- **FR-051**: The practitioner-visible behaviour of the Create form and the View tab MUST remain as specified in Module 1 — the same fields, labels, In-Flow and Out-Flow nature options, ISO (YYYY-MM-DD) dates, "₨" amounts with thousands separators and two decimals, "None" for empty optional values, the current-month default range, and the dark theme. The one exception is the file name, which is now actionable (FR-065) — this supersedes Module 1's rule that it carried no open or preview action.
- **FR-052**: Module 1's rule that recorded statements are immutable is superseded by FR-038 through FR-050; no other Module 1 requirement is relinquished.
- **FR-053**: The header details — brand name, office location and contact numbers — MUST continue to show their built-in values, and this module MUST NOT let the practitioner change or store them. Module 1's header-customisation requirements (FR-026 and FR-027) are superseded, with the control that performed it replaced per FR-018.

**Store integrity and location safety**

- **FR-054**: Only one copy of the application may use the store at a time. When the application is started while another copy is already running, the newly started copy MUST refuse to open the store and MUST tell the practitioner to use the copy that is already running.
- **FR-055**: When the practitioner chooses a location that is cloud-synced, on a network share or on removable media, the application MUST warn them before accepting it — explaining that the records would leave this machine or could become unreachable — and MUST accept the choice only after they confirm.
- **FR-056**: When the store file exists but cannot be opened because it is damaged, the application MUST report this plainly, MUST leave the file completely untouched, and MUST NOT attempt an automatic repair or partial recovery, nor put an empty store in its place.

**Using an existing store file**

- **FR-057**: The practitioner MUST be able to point the application at a store file they already hold — for example a store recovered from a backup after their machine failed — and have the application work from it, instead of only being able to have a new store created for them.
- **FR-058**: From an existing store file, the practitioner MUST be able to recover every record it holds and continue working with it as the store in use.
- **FR-059**: Before an existing file is used, the application MUST verify that it is a store belonging to this application and that its contents can be read.
- **FR-060**: A file that is not such a store — a different kind of file, a file that does not follow the store's expected shape, or a damaged one — MUST be rejected with a clear explanation of why, and MUST be left completely untouched.
- **FR-061**: A rejected file MUST leave the practitioner exactly where they were: the store in use and all of its records MUST remain unchanged, and they MUST be able to choose again.
- **FR-062**: When an existing store file is accepted, that file becomes the store in use and the folder containing it becomes the storage location.
- **FR-063**: When the practitioner chooses to bring their previous records into an accepted store file, a statement that is already present in it MUST NOT be added a second time and MUST NOT be altered there, so carrying records between stores can never duplicate or overwrite them.
- **FR-064**: A store file that is valid but holds no statements MUST be accepted, so the practitioner can deliberately begin from an empty store file they chose.

**Opening and saving an attachment**

- **FR-065**: The practitioner MUST be able to open a stored attachment from where it is shown — in the statement list and while editing a statement — without leaving the application.
- **FR-066**: Opening an attachment MUST hand it to the operating system so it appears in whichever application the practitioner has set as their preference for that kind of file. The application MUST NOT provide a viewer or a preview of its own.
- **FR-067**: To open an attachment, the application MUST write its contents out to a temporary file that the operating system can give to that application.
- **FR-068**: The temporary copy MUST carry the attachment's original name and extension, so the preferred application recognises the type and the practitioner sees the name they know it by.
- **FR-069**: Temporary copies MUST be written to a folder the application manages, kept separate from the store, and MUST be cleared the next time the application starts.
- **FR-070**: A temporary copy MUST NOT be removed while an application is still using it.
- **FR-071**: Every attachment MUST be openable in this way, whatever its type — including files that run code when opened — with no warning or restriction added by the application. This is deliberate; see the assumption recording the developer's decision and its consequence.
- **FR-072**: The practitioner MUST be able to save a copy of an attachment to a location of their choosing, through the operating system's own save prompt, with the attachment's original name offered by default.
- **FR-073**: Saving a copy MUST NOT change, move or remove the stored attachment, and the application MUST NOT begin managing the copy that was saved.
- **FR-074**: Opening or saving an attachment MUST deliver it complete and unchanged, for any file type and size.
- **FR-075**: When an attachment cannot be opened — it cannot be written out, or the operating system has nothing that handles that kind of file — the practitioner MUST be told plainly and MUST still be able to save a copy instead.

### Key Entities *(include if feature involves data)*

- **Statement**: A single recorded financial transaction, now durable and correctable. Key attributes: date, type (In-Flow or Out-Flow), nature, amount, optional remarks, an optional attached file, and a stable identity that survives editing so a corrected statement remains the same statement.
- **Attached File**: An optional supporting document belonging to exactly one statement. It has a name and complete contents, is stored together with its statement, can be replaced or removed when the statement is edited, and its contents are fetched only when that one statement's file is requested.
- **Stored data set**: Everything the application keeps for the practitioner — all statements and all attached file contents — held in one self-contained local store file. It is the sole source of truth for the View tab and is never shared beyond the machine. It can be moved to another location, and a store file the practitioner already holds can become the store in use.
- **Store file**: The single self-contained file holding the stored data set. It is normally created for the practitioner, but one they already hold — for instance a copy kept as a backup — can be chosen and used instead, in which case it becomes the working store.
- **Storage location**: Where the records live. Normally a directory the practitioner chooses, in which a store file is created; if they choose an existing store file instead, the folder containing that file becomes the storage location. It is remembered between sessions and can be changed at any time from the header.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of statements reported as saved are still present, with identical values, after the application is closed and reopened.
- **SC-002**: 100% of statements returned by a date-range review carry the values that were saved, matching what the practitioner entered.
- **SC-003**: 100% of attachments are returned complete and identical to the file that was attached when their own statement's file is requested, for every file type and size.
- **SC-004**: A date-range review over a data set of thousands of statements shows the list and the three totals in under two seconds, and remains under two seconds when many of those statements carry large attachments.
- **SC-005**: A practitioner can locate, correct and save a previously recorded statement, including replacing its attachment, in under one minute.
- **SC-006**: The application refuses to record, review or edit anything until a storage location has been chosen (0 statements are created or reviewed beforehand).
- **SC-007**: A practitioner can choose a storage location and be working in the application within 30 seconds of first launch.
- **SC-008**: On every launch after the first, the application opens the previously chosen location without asking again (100% of launches).
- **SC-009**: 100% of location changes leave the practitioner with every record they chose to bring present in the new location — 0 records lost, and 0 records deleted from any other store.
- **SC-010**: Every operation in this module succeeds with the machine's network connection disabled (0 operations require a network connection).
- **SC-011**: After any interruption, the store contains only complete statements (0 partially stored statements).
- **SC-012**: No edit ever produces an additional statement (0 duplicate records created by editing).
- **SC-013**: 100% of abandoned edits leave the stored statement unchanged.
- **SC-014**: 100% of corrections remain visible after a restart.
- **SC-015**: A date-range review loads the contents of exactly 0 attached files; file contents move only when one statement's file is requested.
- **SC-016**: The store is never in use by more than one copy of the application (0 second copies become usable while another copy is running).
- **SC-017**: 100% of cloud-synced, network or removable locations are warned about before being accepted (0 such locations are accepted silently).
- **SC-018**: A damaged store is reported without being modified (0 bytes of a damaged store are altered, and 0 empty stores take its place).
- **SC-019**: 100% of the records held in a store file the practitioner chooses are available to them after choosing it, matching exactly what that file held.
- **SC-020**: No file that is not a store of this application is accepted, and 100% of rejected files are left byte-for-byte unchanged (0 rejected files modified).
- **SC-021**: Carrying records into a store that already holds records duplicates 0 statements and overwrites 0 statements, so the carried totals always equal the correct sum of distinct records.
- **SC-022**: The practitioner is asked whether to bring their records across on 100% of location changes made while records are in use (0 silent carries and 0 silent discards of their records).
- **SC-023**: 100% of attachments opened are handed to the system complete and unchanged, carrying their original name and extension, for every file type and size.
- **SC-024**: Opening an attachment or saving a copy of one alters 0 stored statements and 0 stored attachments.
- **SC-025**: 100% of saved copies are identical to the stored attachment they came from.
- **SC-026**: A practitioner can open a listed attachment with a single action, and it appears in their preferred application for that kind of file.
- **SC-027**: Temporary copies never accumulate — after the application restarts, 0 copies from the previous session remain.

## Assumptions

- **Scope boundary**: This module covers durable storage of statements and attached files, the storage location the practitioner chooses for them (a directory, or a store file they already hold), recovering the records from such a file, date-range retrieval of statement values and file names, on-demand retrieval of a single statement's file contents, opening a stored attachment through the operating system and saving a copy of it, and in-place editing of a stored statement (including replacing or removing its file). Statement deletion, customising the header's *content* (brand name, location, contacts), reporting and exports, the analytics and processing modules, multi-user access, and any other change to the screens' layout or navigation are out of scope. Replacing the header's Settings control with the storage-directory control is *in* scope. Bringing the store up to date across future versions of the application is explicitly deferred by the developer until an update mechanism exists, and is therefore out of scope here — the specification makes no promise either way about how a store written by one version behaves under another.
- **Storage engine**: A single self-contained local SQL file (SQLite). No server process, no port, no separate installation and no administration. This is the developer's decision recorded in the 2026-09-14 clarification and it reconciles this module with Module 1's plan.
- **Storage location**: Chosen by the practitioner, not by the application. Nothing is suggested or pre-selected; they browse either to a directory, in which a new store file is created, or to a store file they already hold. This supersedes the earlier "lives in the practitioner's application data area" assumption.
- **Remembering the choice**: The chosen location is remembered in the application's own small settings area outside the store, so a later launch can find the store without asking. That settings value is the only thing this module keeps outside the store file.
- **First use is gated**: The application deliberately does nothing else until a location is chosen. There is no default location and no way to bypass the prompt.
- **The previous store file is left in place**: When records are carried across to a new location, the store file they came from is not deleted. It simply stops being the store in use. Confirmed by the developer in the 2026-09-14 clarification; the destructive alternative was considered and rejected.
- **Adopting an existing store**: Choosing a location that already holds records adopts them rather than overwriting them — whether that location is a directory or a store file chosen directly. This also gives the practitioner a way back to a location they used previously.
- **A chosen store file is used where it is**: The file becomes the working store and is written to as the practitioner works, so it stops being a pristine backup. This is deliberate — the developer chose "use it where it is" over copying it, and the application says so when the file is chosen.
- **Statements are recognised by their stable identity**: This is what makes FR-063 possible. A statement carried into a store that already holds it is recognised and left alone rather than added again, and the copy already in the destination is not overwritten.
- **Recovering from a backup file is in scope**: Pointing the application at a store file the practitioner already holds — including after reinstalling on a rebuilt machine — is part of this module, not a future one.
- **Single machine, single user**: One practitioner, one machine, one store in use at a time. The application itself provides no sharing, synchronisation or remote access, and none is needed — though the practitioner may knowingly place the store in a synced or network folder under the FR-055 warning.
- **No application-level encryption**: The stored data and attached files are protected by the practitioner's own machine account and by the store ordinarily being reachable only from that machine — subject to the warned exception in FR-055; no additional application password is imposed on the practitioner. Encryption at rest is therefore not part of this module.
- **Existing data**: Module 1 stored nothing, so there is no data to migrate; the store starts empty and grows from the first statement recorded after this module ships.
- **Attachments**: A statement carries at most one attachment, matching Module 1. Any file type is accepted and **no size limit is imposed** — confirmed in the 2026-09-14 clarification. The reason this is safe is FR-029/FR-036: file contents travel only when one specific statement's file is requested, never with a range review.
- **Attachments are opaque**: The application never opens, converts, indexes or interprets attachment contents itself, and provides no viewer or preview of its own. It hands a temporary copy to the operating system so the practitioner's own applications can display it (FR-066 through FR-070). Module 1's rule that the file name carried no open or preview action is superseded (FR-051).
- **Temporary copies exist outside the store**: Opening an attachment writes a copy into a folder the application manages, because another program cannot be handed contents held inside the store. Those copies are the only place attachment contents exist outside the store file; they are cleared when the application next starts and may briefly outlive the session that created them. That is the trade-off accepted in order to open files in the practitioner's own applications.
- **Any file type opens with no warning**: The developer chose that every attachment — including programs, scripts and shortcuts — is handed to the system's handler with no exception and no prompt from the application, having been shown that such a file will run with their privileges when clicked. This is recorded as a deliberate decision with a known consequence so that planning does not add a warning that was considered and declined, and so the risk is not forgotten if a statement ever arrives from a third party.
- **Header details**: Fixed. The brand name, location and contacts keep their built-in values, cannot be updated, and are therefore not stored (see FR-053). The control that previously edited them is replaced by the storage-directory control (FR-018).
- **Verification approach**: The developer has directed that the backend surface is small enough not to require automated backend tests; acceptance is verified by exercising the application end to end. The Module 1 frontend tests must keep passing.
- **Dates and ordering**: Dates are calendar dates in ISO format with no time component, as in Module 1; the ordering and tie-breaking rules used by Module 1 are preserved.
- **Amounts**: Amounts remain positive currency values in Pakistani Rupees and are stored without rounding or precision loss, so the View totals always match the listed statements.
