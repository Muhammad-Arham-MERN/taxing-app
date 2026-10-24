# Feature Specification: Offline Work — Communicate Live (Cloud Sync)

**Feature Branch**: `004-cloud-sync`
**Created**: 2026-10-15
**Status**: Draft
**Input**: User description: "This specification is being written to enhance the functionality of our current App. It is a major feature of 'Offline Work - Communicate Live'. The app, when installed on other computers, should communicate with the other computer's personal database and involve a sort of integrity that all data remains constant across different computers. The app itself must not require internet — its offline architecture remains. Keeping the cost minimal and extra sophistication was a challenge to be met using online - offline - cost effectiveness. If the data of one computer updates, the update is made locally but the other computers are also updated with it. ... Keep functioning of the application offline; store the operations performed by the user offline; when we get internet access only then publish them to other computers to remain in sync and also push operations done by other computers to this computer to update its data; data remains integral, duplication should not occur. ... We will keep only text in the Turso cloud because Turso gives only 5GB free and cost is high; a future specification will also hold raw binary files, so for that only the reference is stored as text in the cloud and the file is located and downloaded from Oracle Cloud Object Storage. ... Current workflow: implement Turso's storage system into the current data storage flow, upgrading local storage with cloud storage as well; only Turso Cloud for now, not Oracle. Push and Pull implemented as: a Push button in the app header that pushes current data changes to the cloud when there is internet; a warning popup to push changes before closing the app when there are un-pushed changes; Pull renamed 'Sync' on the header; automatic Pull on startup when there is internet; and a programmatic Pull every 1 hour when there is internet. Use the Turso Usage API to retrieve the bytes left out of the 5GB limit and show Turso Cloud at the top header with a purple loader indicating storage left. Contradicting data should also be incorporated (asked the client). Push and Pull requests must give clear indication messages — server errors (not responding/unavailable/not configured), data errors (malformed data not sent, removed from the push queue, user informed), internet errors (internet not available). Write no tests. Study the proof-of-concept at tax-statements-analysis/src-tauri/sync-poc. (Full prompt text preserved in the Prompt History Record.)"

## Overview

The application today is a **fully offline, single-user desktop tool that lives on one machine**. Modules 1–3 gave the practitioner Statements, Bills and the customers they are billed to, all kept in one self-contained local store file that never leaves the computer. This module is the first half of **"Offline Work — Communicate Live"**: it makes the practitioner's own work follow them across the computers they use, **without ever making the application depend on a network**.

The design keeps the machine as the working copy and adds a **shared cloud copy** used only as the place where computers exchange changes. The practitioner keeps creating, editing and deleting exactly as they do now, online or not; each change is recorded on the machine as it always was. Nothing about the offline experience changes. When — and only when — the internet happens to be available, the practitioner can **Push** the changes made on this computer up to the shared cloud copy, and **Sync** (pull) the changes made on the other computers down into this one. Both computers end up holding the same records, with no duplicates and no lost work. Sync also happens on its own: once when the application starts, and about once an hour while it is open, so the two computers drift back together without the practitioner having to remember to press anything. Setting a computer up is itself part of the design: the practitioner chooses where their records will live and pastes the small env file their partner gave them, whose values the application keeps in **Windows Credential Manager** — so the installer never carries a secret and the practitioner never has to type one again.

Because the cloud copy is deliberately **small and cheap**, it holds **text records only** — statements, bills and customers. Binary files are deferred to a later module; the proof-of-concept already demonstrates the shape they will take (only a text reference to a file is synced, while the file itself lives cheaply elsewhere), but this module does not use it. The header surfaces how much of the cloud allowance remains, as a purple indicator beside the new Push and Sync actions, so a finite and costly resource is never a surprise.

Two things must hold at all times: **the application must remain fully usable offline**, and **the data must stay integral** — the same record must never become two, and a change must never silently disappear. The store on each computer is a **local-first database that keeps working offline and syncs itself** with the one central cloud copy. Where the same record was changed on two computers while they were apart, **the last push wins** — the store's own sync rule — and both computers converge on that result, so they never disagree and the practitioner is never asked to choose. Because an exchange can take real time on a slow connection — and will take longer once files are involved in a later module — the practitioner is always shown that a Push or Sync is **in progress**, rather than being left to wonder whether the application has stalled.

This specification describes only what the practitioner can do and observe; how the cloud copy is reached, how changes are recorded for publishing, and how the two sides are merged belong to the plan rather than here.

## Clarifications

### Session 2026-10-15

- Q: Who shares the shared cloud copy — is it private to one practitioner and their own computers, or do multiple practitioners/users share a single cloud copy? → A: **One central cloud copy, with each computer keeping its own personal local database; every connected computer is kept in sync through that single central copy** (client choice, 2026-10-15). The connection details are **not packaged in the installer**; the partner gives the practitioner an env file, which they paste once at onboarding (Q6).
- Q: When the same record is changed on two computers while they were apart, how should the two versions be reconciled so both computers agree? → A: **The last push wins** — this is the store's own sync rule (client choice, 2026-10-15). The computers converge on whichever change was pushed last; **no custom reconciliation is performed** and the practitioner is never asked to choose.
- Q: When the practitioner closes the application with changes not yet published and cannot (or chooses not to) push, should closing be blocked or allowed? → A: **Closing is allowed** — the practitioner is not trapped; un-published changes remain safe on the machine and can be pushed later (client choice, 2026-10-15).
- Q: Should the practitioner be able to see that a Push or Sync is in progress, given it may not be instantaneous? → A: **Yes — a progress indicator (loader/progress tracker) MUST be shown on the frontend for the whole duration of a Push or Sync** (client request, 2026-10-15). Because later modules will sync files and slow internet can make an exchange take real time, the practitioner must see that work is in progress rather than assume the application has stalled.
- Q: Should exact duplicates be reconciled by comparing their contents, as originally proposed? → A: **No — the earlier content-based duplication-reconciliation idea is dropped** (client choice, 2026-10-15). The store's own row identity and the sync rule already keep the computers consistent: the same record is the same row on every computer, and conflicts are settled by the last push. No separate content-comparison step is performed.
- Q: How are the cloud connection details supplied to each install, and where are they kept? → A: **Pasted once at onboarding and saved into Windows Credential Manager** (client choice, 2026-10-15). The installer carries **no** secrets. When a computer has not yet been set up, onboarding checks whether the secrets are present; if they are not, a screen asks the practitioner to paste the env file the partner gave them, which the application **parses, validates and saves into Windows Credential Manager**. The application reads the values **from Windows Credential Manager** whenever it needs them. Setup is not complete — and the application is not usable — until these secrets exist, exactly as a usable store is required.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Push Local Changes to the Cloud (Priority: P1)

The practitioner has spent the day working with the application exactly as before — creating statements, raising bills, correcting customers — with no thought for the network, because nothing asked for it. When work is done and the internet happens to be available, they press **Push** in the header. The application publishes everything they have changed since the last exchange to the shared cloud copy and tells them plainly that it worked and that their work is now shared. If there is no connection, or the cloud cannot be reached or is not set up on this computer, they are told clearly what went wrong — and nothing is lost: the work stays on the machine, ready to be pushed another time.

**Why this priority**: Publishing is the foundation of the whole feature. Without it there is nothing for another computer to receive. On its own it already delivers value — a safe copy of the practitioner's work exists beyond the single machine — and it is the prerequisite for every other story here.

**Independent Test**: Can be fully tested by making a change with the network disabled, confirming the application behaves normally, then enabling the network and pressing Push, and confirming a clear success outcome appears, that pressing Push again reports nothing new and creates no duplicate, and that a disconnect during the attempt is reported without losing the change.

**Acceptance Scenarios**:

1. **Given** this computer holds changes that have not yet been published and there is internet access, **When** the practitioner presses Push, **Then** those changes are published to the shared cloud copy and a clear success outcome is shown.
2. **Given** this computer holds no un-published changes, **When** the practitioner presses Push, **Then** the application reports that there is nothing to publish and creates no duplicate record.
3. **Given** there is no internet access, **When** the practitioner presses Push, **Then** the application tells them the internet is unavailable, does not publish anything, and leaves every local record exactly as it was.
4. **Given** the application has been set up, **When** the practitioner presses Push, **Then** it reads the connection details from Windows Credential Manager and does not ask for them again.
5. **Given** the shared cloud copy cannot be reached (server not responding or unavailable), **When** the practitioner presses Push, **Then** a clear server-unavailable outcome is shown and no local record is altered.
6. **Given** a change cannot be stored because it is malformed, **When** it is entered, **Then** it is rejected at the store boundary so that it never enters the database and can never be published; the practitioner is told, and their other work is unaffected.
7. **Given** a Push has succeeded, **When** the practitioner inspects the local records, **Then** their values are identical to before the push — publishing changes what the other computers can see, not what this computer holds.
8. **Given** the internet drops while a Push is running, **When** the attempt ends, **Then** the outcome is reported clearly and no partially published state is presented as success.
9. **Given** the connection is slow and a Push takes some time, **When** the practitioner presses Push, **Then** a progress indicator stays visible on the frontend for the whole duration of the push, so the practitioner sees that work is in progress rather than thinking the application has stalled.

---

### User Story 2 - Sync Changes Down From Other Computers (Priority: P2)

The practitioner works on one computer in the morning and another in the afternoon. On the second computer they press **Sync** in the header and the work done on the first — the statements, bills and customer details they published there — appears in the second, ready to use. Everything they already had is still exactly where it was: a record that exists on both computers is kept as one record, never doubled, and pressing Sync again when nothing new has been published simply reports that there is nothing to bring in.

**Why this priority**: This is what turns a single machine's cloud copy into genuine multi-computer sharing and is the second half of the feature's promise. It sits below publishing only because there is nothing to receive until something has been published, and it depends on that capability.

**Independent Test**: Can be fully tested by publishing a change from one computer, then pressing Sync on a second computer and confirming the change appears with a clear outcome, that no existing record is duplicated, that pressing Sync repeatedly creates no copies, and that a disconnection is reported without disturbing local data.

**Acceptance Scenarios**:

1. **Given** another computer has published changes, **When** the practitioner presses Sync with internet access available, **Then** those changes are brought into this computer's local store, are visible to the practitioner, and a clear outcome reports that changes arrived.
2. **Given** no changes have been published since the last Sync, **When** the practitioner presses Sync, **Then** the application reports that there is nothing new and creates no duplicate.
3. **Given** a change has already been synced, **When** the same change is synced again, **Then** no duplicate record is created.
4. **Given** a record that already exists locally is present in the cloud copy, **When** it is synced, **Then** the existing record is kept or brought up to date in place rather than added a second time.
5. **Given** there is no internet access, **When** the practitioner presses Sync, **Then** the application tells them the internet is unavailable and leaves local data unchanged.
6. **Given** the shared cloud copy is unreachable or not responding, **When** the practitioner presses Sync, **Then** the appropriate clear outcome is shown and local data is unchanged.
7. **Given** changes have been synced in, **When** the application is closed and reopened, **Then** those changes are still present and behave exactly like records created on this computer.
8. **Given** a change in the cloud copy is malformed, **When** Sync runs, **Then** it does not corrupt the local data, the bad change is reported, and the remaining good changes are still brought in.
9. **Given** the connection is slow and a Sync takes some time, **When** it is running, **Then** a progress indicator stays visible on the frontend for the whole duration, so the practitioner sees that work is in progress rather than thinking the application has stalled.

---

### User Story 3 - Sync Happens On Its Own (Priority: P3)

The practitioner never has to think about syncing. When they open the application and there is internet, it Syncs quietly in the background shortly after starting. While they keep it open, it checks about once an hour for changes made on the other computers and brings them in. None of this interrupts what they are typing, steals focus, or loses a half-entered form; if the cloud cannot be reached at one of these moments, nothing is disturbed and it simply tries again later.

**Why this priority**: Automatic syncing removes the burden of remembering to press Sync and keeps the computers close together, which is what makes the feature feel effortless. It is below the manual Push and Sync because both work fully without it — it is convenience, not capability.

**Independent Test**: Can be fully tested by publishing a change elsewhere, opening the second application with internet available and confirming it Syncs within a short time of starting without the practitioner acting, then publishing another change and confirming it is brought in at roughly the one-hour check, with no interruption to an in-progress entry, and that an unreachable cloud at these moments disturbs nothing.

**Acceptance Scenarios**:

1. **Given** there is internet access, **When** the application starts, **Then** it Syncs automatically within a short time of opening, without the practitioner pressing anything.
2. **Given** there is no internet access, **When** the application starts, **Then** it does not Sync, reports nothing alarming, and works normally.
3. **Given** the application has been open for about an hour with internet access, **When** the automatic check runs, **Then** it pulls any changes made elsewhere and adds them to the local store.
4. **Given** the practitioner is in the middle of entering a statement or a bill, **When** an automatic Sync runs, **Then** their in-progress entry is not disturbed, cleared or lost.
5. **Given** the cloud cannot be reached at an automatic Sync, **Then** the application carries on undisturbed and retries at the next opportunity.
6. **Given** an automatic Sync brings changes in, **When** the practitioner looks at the affected records, **Then** the changes are present and indistinguishable from records created on this computer.

---

### User Story 4 - Safeguard Un-Pushed Work When Closing (Priority: P4)

The practitioner finishes and closes the application — but some of the day's work has not yet been published. Before the window disappears, a warning appears telling them there are changes not yet shared and offering to push them. If they choose to push, the work is published and then the application closes; if it cannot be published just then, they are told why and can still close, safe in the knowledge that nothing has been lost — the work is still on the machine and can be pushed later.

**Why this priority**: It protects against the quiet loss of unsynced work and nudges the practitioner to keep their computers current. It sits below creating, publishing and pulling because those must exist first for there to be anything to safeguard.

**Independent Test**: Can be fully tested by making a change that is not published, closing the application, and confirming the warning appears and offers to push; choosing to push and confirming it publishes before closing; and choosing to close anyway and confirming the change is still present and publishable after reopening. Confirm no warning appears when there is nothing un-published.

**Acceptance Scenarios**:

1. **Given** this computer holds changes that have not been published, **When** the practitioner closes the application, **Then** a warning appears before it closes and offers to push those changes.
2. **Given** the warning is shown and there is internet access, **When** the practitioner chooses to push, **Then** the changes are published and the application then closes.
3. **Given** the warning is shown and the changes cannot be published (no internet, or the cloud unreachable), **When** the practitioner chooses to push, **Then** they are told why it could not be published.
4. **Given** the warning is shown, **When** the practitioner chooses to close without pushing, **Then** the application closes and the un-published changes remain safe on the machine, still able to be pushed after reopening.
5. **Given** this computer holds no un-published changes, **When** the practitioner closes the application, **Then** no warning appears and it closes normally.
6. **Given** a change was left un-published at close, **When** the application is reopened and Push is used, **Then** that change is published.

---

### User Story 5 - See How Much Cloud Space Remains (Priority: P5)

The practitioner looks at the header between the other actions and sees the cloud shown as **Turso Cloud** with a purple indicator of how much of the storage allowance is left. It moves as the data grows and refreshes whenever the application syncs, so there is always a plain sense of how close the shared cloud copy is to full. When the figure cannot be fetched — because there is no internet, or the cloud cannot be reached — the indicator says so rather than showing a misleading number.

**Why this priority**: The shared cloud copy is a small, finite and costly resource; showing its headroom keeps the practitioner's expectations honest and helps avoid filling it. It is the lowest priority because it is informational — every other story works fully without it.

**Independent Test**: Can be fully tested by observing the header indicator, confirming it names Turso Cloud and shows an amount of storage remaining out of the allowance with a purple presentation, confirming it updates after a Sync, and confirming it reports unavailability when the figure cannot be retrieved.

**Acceptance Scenarios**:

1. **Given** the application is open and the storage figure can be retrieved, **When** the practitioner looks at the header, **Then** the cloud is shown as "Turso Cloud" with a purple indicator of how much storage remains out of the allowance.
2. **Given** the storage figure has been retrieved, **When** the practitioner performs a Push or Sync that changes how much is stored, **Then** the indicator reflects the updated amount.
3. **Given** the storage figure cannot be retrieved (no internet, or the cloud unreachable), **When** the practitioner looks at the header, **Then** the indicator reports that it is unavailable rather than showing a wrong or stale value presented as current.
4. **Given** the shared cloud copy is nearly full, **When** the practitioner looks at the indicator, **Then** it is clear from the presentation that little space remains.

---

### User Story 6 - Set Up Sync on a New Computer (Priority: P1, prerequisite)

When the application is installed on a computer for the first time it is not yet ready: no store has been chosen and no cloud secrets are present. Alongside choosing where their records will live, the practitioner is asked for the "secrets" their partner gave them — a small env file. They paste it once; the application reads the required values out of it, checks them, and stores them securely, and from then on it uses them by itself. Until that is done the application does not let them work, just as it does not until a usable storage location is chosen — but the secrets are never typed again, and the installer never carried them.

**Why this priority**: This is the gate every other story passes through — no Push, no Sync and no use of the application is possible until the secrets exist. It is a prerequisite, so although it is written last it must land first.

**Independent Test**: Can be fully tested by installing on a fresh machine, confirming the application asks for the secrets when they are absent, pasting a valid env file, confirming each required value is stored and the application becomes usable, restarting and confirming it does not ask again, and confirming that an invalid or incomplete paste is rejected with a specific message and saves nothing.

**Acceptance Scenarios**:

1. **Given** a fresh install with no store chosen and no secrets, **When** the practitioner opens the application, **Then** setup asks them both to choose where their records will live and to paste their secrets.
2. **Given** the secrets screen is shown, **When** the practitioner pastes the env file their partner gave them, **Then** the application reads the required values from it and saves them into Windows Credential Manager.
3. **Given** the secrets have been saved, **When** the practitioner uses the Push and Sync actions, **Then** the application reads the connection details from Windows Credential Manager without asking again.
4. **Given** the secrets have been saved, **When** the application is closed and reopened, **Then** it does not ask for the secrets again, and it remains usable offline.
5. **Given** the pasted env file is malformed or is missing a required value, **When** the practitioner submits it, **Then** the application says which value is missing or unreadable, saves nothing, and does not become usable.
6. **Given** the practitioner wants to replace the secrets, **When** they choose to paste a new env file, **Then** the stored values are replaced with the new ones.
7. **Given** Windows Credential Manager cannot be read or written, **When** the practitioner submits the secrets, **Then** the application reports the problem rather than continuing without secrets.
8. **Given** the application is installed, **Then** neither the installer nor the application's own files contain any secret.

---

### Edge Cases

- **Working with no internet**: every create, edit, view and delete — for statements, bills and customers — must succeed with the network entirely disabled, exactly as before this module.
- **Secrets not configured**: a computer on which the secrets have not been pasted is not usable — onboarding asks for them (User Story 6), and until they are saved no Push, Sync or normal use is possible.
- **Malformed or incomplete env paste**: an env file that cannot be parsed, or that is missing a required value, is rejected with a specific message naming what is wrong, and nothing is saved.
- **Re-pasting the secrets**: once saved, the secrets are not asked for again; the practitioner may deliberately paste a fresh env file to replace them.
- **Credential store unavailable**: if Windows Credential Manager cannot be read or written, the application reports it and does not run without secrets.
- **The installer carries no secrets**: nothing the application ships or installs contains a secret of its own.
- **Server not responding / unavailable**: a reachable internet connection but an unreachable or erroring cloud copy must be reported as a server problem, distinct from having no internet, and must never alter or lose local data.
- **Malformed change**: a change that cannot be stored is rejected at the store boundary, so it can never enter the database or reach the central copy; the practitioner is told, and their other work is unaffected.
- **Repeated Push with nothing to send**: must report "nothing new" and create no duplicate.
- **Repeated Sync with nothing new**: must report "nothing new" and create no duplicate.
- **The same record changed on both computers while apart**: the **last push wins** and both computers converge on that result; the outcome is deterministic, so the computers never disagree and the practitioner is never asked to choose.
- **The same record created on both computers while apart**: two separately created records remain two records — the store does not attempt to work out that they are "the same" (client choice, 2026-10-15); the practitioner deletes the unwanted one, and that deletion then travels to the other computer on the next exchange.
- **A record deleted on one computer**: the deletion must be reflected on the other computers rather than the record reappearing.
- **First connection of a computer that already holds data**: connecting a computer that has been used offline before must merge its existing records with the cloud copy rather than duplicating them or replacing them wholesale.
- **Sync running while the practitioner edits**: an automatic or manual Sync must not disturb an in-progress entry or apply changes in a way that overwrites a half-typed form.
- **The application is closed or the machine stops during a Push or Sync**: no half-applied state may be left; a record is either exchanged completely or not at all, and the next attempt recovers cleanly.
- **Push and Sync close together**: overlapping or quick repetitions must not create duplicates or interleave into an inconsistent state.
- **Very large local store**: syncing a store holding many records must complete without aiming to move more than the cloud allowance permits, and the storage indicator must make an approaching limit visible.
- **Cloud allowance exhausted**: when the shared cloud copy is full, pushing must be reported as failing for want of space rather than silently failing, and local work must remain intact.
- **Slow connection or a lengthy exchange**: a Push or Sync that takes real time — slow internet, or larger exchanges once files are involved — must keep a progress indicator visible so the practitioner sees it is working and does not mistake it for a frozen application.
- **Clock differences between computers**: the last push wins, so a conflict is not decided by either computer's clock; and records keep a stable, non-decreasing ordering by their own recorded dates, so review lists remain sensible.
- **Store not usable**: as elsewhere in the application, no record can be created, reviewed, edited or deleted until a usable store exists; sync actions likewise have nothing to act on until then.

## Requirements *(mandatory)*

### Functional Requirements

**Offline-first foundation**

- **FR-001**: The application MUST remain fully usable with no network connection: every existing create, review, edit and delete operation for statements, bills and customers MUST succeed offline exactly as before, and MUST NOT depend on the cloud.
- **FR-002**: There MUST be **one central cloud copy**, and each computer MUST keep its **own personal local database**; every connected computer MUST exchange through that one central copy so that all of them are kept in sync (client choice, 2026-10-15). The central copy is the shared point of exchange, not the working copy.
- **FR-003**: The local store on each computer MUST remain the working copy and the source for all offline operations; the shared cloud copy MUST be used only as the point of exchange and MUST NOT be required to be **reachable** for normal use — although its **secrets** must be configured before the application is usable (FR-005).
- **FR-004**: The application MUST be able to tell whether it currently has working internet access, and MUST behave gracefully when it does not.
- **FR-005**: The application MUST require the cloud secrets to be configured before it can be used, exactly as a usable store is required: with no secrets present, onboarding MUST ask the practitioner to provide them, and no normal operation is reachable until they are saved (client choice, 2026-10-15).

**Push — publishing local changes**

- **FR-006**: The application header MUST offer a **Push** action.
- **FR-007**: Push MUST publish this computer's changes made since the last successful exchange to the shared cloud copy.
- **FR-008**: Push MUST NOT alter the values of the local records it publishes; publishing MUST change only what other computers can see.
- **FR-009**: Push MUST report a clear success outcome, including when there was nothing new to publish.
- **FR-010**: Push MUST be safe to repeat: publishing when there is nothing new MUST create no duplicate and MUST be reported as nothing new.
- **FR-011**: A change that cannot be stored MUST be rejected at the store boundary, so it can never enter the database or reach the central copy; the practitioner MUST be told, and their other work MUST be unaffected.
- **FR-012**: Push MUST NOT be presented as successful when the internet is unavailable or the cloud cannot be reached.

**Sync — bringing changes down from other computers**

- **FR-013**: The application header MUST offer a **Sync** action that pulls changes made on other computers.
- **FR-014**: Sync MUST bring changes published by other computers into this computer's local store so the practitioner can see and use them.
- **FR-015**: Sync MUST NOT duplicate records: a record already present MUST be kept or brought up to date in place rather than added again, and repeated Sync MUST create no copies.
- **FR-016**: Applied changes MUST persist in the local store across a restart and MUST be indistinguishable from records created on this computer.
- **FR-017**: Sync MUST report a clear outcome, including when there was nothing new to bring in.
- **FR-018**: Sync MUST NOT corrupt or discard local data when the internet is unavailable, the secrets are unavailable, the cloud cannot be reached, or a change in the cloud copy is malformed.
- **FR-019**: When two computers changed the same record while apart, the **last push MUST win**, per the store's own sync rule (client choice, 2026-10-15), and both computers MUST converge on that result. No custom or content-based reconciliation is performed, and the practitioner is not asked to choose.
- **FR-020**: A record deleted on one computer MUST be removed on the others when they sync, rather than reappearing.

**Automatic sync**

- **FR-021**: When the application starts and internet access is available, it MUST Sync automatically, without the practitioner acting.
- **FR-022**: While the application is running, it MUST automatically Sync approximately once every hour when internet access is available.
- **FR-023**: An automatic Sync MUST NOT interrupt, clear or lose the practitioner's in-progress entry.
- **FR-024**: An automatic Sync that cannot reach the shared cloud copy MUST NOT disturb the application, and MUST be retried at the next opportunity.

**Safeguarding un-published work on close**

- **FR-025**: When the practitioner closes the application while changes remain un-published, the application MUST warn before closing and MUST offer to Push those changes.
- **FR-026**: If the practitioner chooses to Push from the warning, the changes MUST be published (when internet and the shared cloud copy permit) before the application closes; if they cannot be published, the practitioner MUST be told why.
- **FR-027**: Un-published changes MUST NOT be lost: if the application closes without publishing them, they MUST remain on the machine and MUST still be publishable after reopening.
- **FR-028**: No warning MUST appear when there are no un-published changes. When changes are un-published and cannot (or are not) pushed, **closing MUST still be allowed** — the practitioner MUST NOT be trapped, and the un-published changes MUST remain safe on the machine to be pushed later (client choice, 2026-10-15).

**Cloud storage indicator**

- **FR-029**: The application header MUST show the shared cloud copy as **"Turso Cloud"** with an indicator of how much storage remains out of the available allowance, presented as a purple-colored loader/gauge.
- **FR-030**: The indicator MUST reflect the storage actually in use in the shared cloud copy, and MUST refresh when the application performs a Push or Sync.
- **FR-031**: When the storage figure cannot be retrieved, the indicator MUST report that it is unavailable rather than presenting a wrong or stale value as current.
- **FR-032**: The indicator MUST make it plain when little storage remains.

**Clear outcomes for every sync action**

- **FR-033**: Every Push and every Sync MUST end with a clear, plain-language outcome the practitioner can understand, which MUST distinguish at least: success; nothing new; internet unavailable; secrets unavailable (the credential store could not be read); server not responding or unavailable; malformed data skipped; and any other failure.
- **FR-034**: Data that is malformed MUST be prevented at the store boundary so that it can neither enter the database nor reach the central copy, and any sync-level failure MUST be reported to the practitioner without corrupting local data.
- **FR-035**: Sync actions MUST NOT be reported as successful when they did not complete.

**Progress and visibility**

- **FR-036**: A Push or Sync that is in progress MUST show the practitioner a **progress indicator (loader/progress tracker)** on the frontend for as long as the exchange is running, so a slow operation is understood as working rather than as the application having stalled.
- **FR-037**: The progress indicator MUST NOT be presented as a finished success before the exchange has actually ended, and MUST be replaced by the final outcome (FR-033) when it does.

**Data integrity and scope**

- **FR-038**: After all connected computers have Pushed and Synced, they MUST hold the same records with the same values.
- **FR-039**: No sequence of Push and Sync — including repetitions and overlapping operations — may create a duplicate record.
- **FR-040**: The practitioner's existing local data MUST NOT be lost or altered merely by connecting the computer to the shared cloud copy; connecting a computer that already holds data MUST merge it rather than replace or duplicate it.
- **FR-041**: This feature MUST sync the practitioner's text records — statements, bills and customers. Binary files and attachments MUST be out of scope for this feature; only the records themselves MUST be exchanged.
- **FR-042**: The shared cloud copy MUST hold text records only and MUST remain within a small, cost-minimal allowance, consistent with the free tier already chosen.
- **FR-043**: No content-based duplicate reconciliation is performed: records are identified by their own identifier, the same record is the same row on every computer, and a conflict on that record is settled by the last push (FR-019).

**Sync setup and secrets**

- **FR-044**: On a computer where the cloud secrets are not present, onboarding MUST present a screen asking the practitioner to paste their env file, at the same stage as choosing where their records will live.
- **FR-045**: The pasted env file MUST be parsed and the required values extracted. The required set is the central-copy connection details (the store address and its auth token) together with the Usage-API details (organisation, database and platform token).
- **FR-046**: Every extracted value MUST be saved into **Windows Credential Manager**, and MUST NOT be written to the store, to `settings.json`, to the installer, or to any other file the application ships, installs or writes.
- **FR-047**: Whenever the application syncs or asks for the storage figure, it MUST read the values **from Windows Credential Manager** — not from the process environment and not from the build.
- **FR-048**: A paste that cannot be parsed, or that is missing a required value, MUST be rejected with a specific message naming what is wrong, and MUST NOT be saved; setup MUST remain incomplete.
- **FR-049**: Once the secrets are saved, onboarding MUST NOT ask for them again, and the practitioner MUST be able to deliberately replace them by pasting a fresh env file.

### Key Entities *(include if feature involves data)*

- **Local store**: The single database file on each computer, holding statements, bills and customers. It is a **local-first database that keeps working offline** and syncs itself with the one central cloud copy when a Push or Sync is asked for; it remains the practitioner's own working copy and the source of every normal operation.
- **Shared cloud copy**: The single, small, text-only cloud copy that connected computers exchange through. It is not the working copy; it holds the practitioner's records as text and has a finite storage allowance whose headroom is shown in the header.
- **Change**: An individual create, edit or delete performed in the local store. Changes are what move between a computer and the shared cloud copy — a computer publishes the changes it has made since its last exchange, and receives the changes others have published.
- **Un-published changes**: The recorded changes on a computer that have not yet been published. Their presence is what raises the warning when the application is closed and what a Push sends.
- **Sync outcome**: The plain-language result of a Push or Sync — success, nothing new, internet unavailable, secrets unavailable, server unavailable, malformed data skipped, or another failure — shown to the practitioner so every attempt is understood.
- **Storage indicator**: The header presentation of the shared cloud copy ("Turso Cloud") showing, as a purple loader, how much of the storage allowance remains, or that the figure is unavailable.
- **Progress indicator**: The on-screen loader shown while a Push or Sync is running, so the practitioner can see that an exchange is in progress — especially on a slow connection, or when a larger exchange (such as files, in a later module) is under way.
- **Cloud secrets**: The connection details the application needs to reach the central copy and report its storage — the store address, its auth token, and the Usage-API organisation, database and platform token. They come from the partner as an env file, are pasted once at onboarding, and are held in **Windows Credential Manager** — never in the installer and never in a file the application writes. The application reads them from there whenever it needs them.
- **Setup gate**: What must be satisfied before the application is usable — a usable store **and** the cloud secrets. With either missing, onboarding is shown instead of the application.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing operations — creating, reviewing, editing and deleting statements, bills and customers — succeed with the machine's network connection disabled (0 operations require the network).
- **SC-002**: A change made on one computer is visible on another after one Push and one Sync, appearing exactly once (0 duplicates).
- **SC-003**: Repeating Push and Sync ten times in a row creates 0 duplicate records and changes nothing after the first exchange.
- **SC-004**: After all connected computers have Pushed and Synced, 100% of their records match one another in identity and value.
- **SC-005**: When internet access is available, the application completes an automatic Sync within one minute of starting, with no action by the practitioner.
- **SC-006**: While the application is open with internet access, an automatic Sync runs at least once in every 60–75 minute period.
- **SC-007**: 100% of attempts to close the application with un-published changes show the warning; 0 attempts to close with nothing un-published show it.
- **SC-008**: 0 un-published changes are lost when the application is closed without publishing — every one remains present and publishable after reopening.
- **SC-009**: 100% of Push and Sync attempts present exactly one clear outcome that the practitioner can tell apart from the others (success, nothing new, no internet, secrets unavailable, server unavailable, malformed data, other failure).
- **SC-010**: A single malformed change blocks 0 other changes — the others are still exchanged and the malformed one is reported.
- **SC-011**: The header's storage indicator reflects the actual storage in use in the shared cloud copy, refreshes after a Push or Sync, and reads as unavailable within the same action when the figure cannot be retrieved.
- **SC-012**: Computers that each edited the same record while apart hold identical records after both Push and Sync — the last push prevails — with 0 divergent records.
- **SC-013**: Connecting a computer that already holds offline data into an existing shared copy results in 0 duplicated records and 0 records lost.
- **SC-014**: 0 amounts of cloud storage are used beyond the text records of this feature (binary files and attachments contribute nothing to the shared cloud copy).
- **SC-015**: A practitioner can complete a round trip — Push on one computer and Sync on another — in under one minute on a working internet connection.
- **SC-016**: For 100% of Push and Sync operations that take measurable time, a progress indicator is visible for the whole duration of the exchange, so the practitioner is never left with a silent, apparently-frozen exchange.
- **SC-017**: 100% of fresh installs can be set up by pasting the partner's env file once; 0 installs require the installer to carry a secret.
- **SC-018**: 0 secrets are written to the store file, to `settings.json`, or to any file the application writes; 100% are held in Windows Credential Manager.
- **SC-019**: 100% of invalid or incomplete env pastes are rejected with a message naming what is wrong, saving 0 values.
- **SC-020**: 0 normal operations are reachable on a computer whose secrets are not configured.

## Assumptions

- **One central cloud, personal local databases**: There is a single central cloud copy, and each computer keeps its own personal local database; all connected computers exchange through the one central copy and are kept in sync (client choice, 2026-10-15). Consequently every connected computer converges on the same set of records. The **connection details for the central copy are not packaged in the installer**; the partner supplies them as an env file, which the practitioner pastes once at onboarding, after which they are held in **Windows Credential Manager** (FR-044–FR-049).
- **Text-only scope**: This module syncs the text records the application already holds — statements, bills and customers. Binary files and attachments are explicitly deferred to a later module. The proof-of-concept in `src-tauri/sync-poc` shows the intended shape of that later work (a text reference is synced while the file itself is kept cheaply elsewhere), but this module does not implement it.
- **Cloud provider**: The shared cloud copy is the already-chosen Turso Cloud offering, with a 5 GB free allowance as the reference figure for "storage left". No other provider is in scope for this module; Oracle Object Storage is deferred with the files.
- **Cost-minimal by design**: Only text is synced, so the shared copy stays small and within the free allowance; the storage indicator exists precisely to keep the practitioner aware of this finite resource.
- **Progress visibility**: Because a Push or Sync may take real time — a slow connection, and later when files are involved — the practitioner is shown a progress indicator for the duration of the exchange rather than a silent wait, so a long exchange is never mistaken for a stalled application (client request, 2026-10-15).
- **Where the actions live**: The new Push and Sync actions and the "Turso Cloud" storage indicator sit in the application header, which today already carries the brand identity, the theme toggle and the storage-directory action.
- **Push and Sync are also available manually**: The header actions let the practitioner publish or pull on demand at any time; automatic syncing (on start and hourly) is in addition to, not instead of, these manual actions.
- **Deletions travel like other changes**: A deletion recorded on one computer is a change like any other and is reflected on the others, so a deleted record does not reappear on sync.
- **Conflict handling**: When the same record was changed on two computers while apart, the **last push wins** — the store's own sync rule (client choice, 2026-10-15); the computers converge on that result and the practitioner is never asked to choose.
- **No content-based reconciliation**: An earlier proposal to deduplicate records by comparing their contents is dropped (client choice, 2026-10-15). Records are identified by their own identifier; because each record is the same row on every computer and conflicts are settled by the last push, no separate duplication step is needed.
- **Close behaviour**: The close-time warning offers to Push but never traps the practitioner — closing is always allowed, and un-published changes remain on the machine to be pushed later (client choice, 2026-10-15).
- **Storage figure source**: The amount of storage used/remaining in the shared cloud copy is obtainable from the cloud offering's own usage reporting (Turso's Usage API), using the credentials held in Windows Credential Manager; the exact call belongs to the plan rather than here.
- **Secrets are never packaged**: The installer and the application's own files carry no secrets (client choice, 2026-10-15). The partner hands the practitioner an env file; the practitioner pastes it once at onboarding; the application extracts the required values and stores them in Windows Credential Manager. This replaces the earlier idea of baking the credentials into the build, which the developer rejected as unreliable.
- **Setup is gated**: The application is not usable until **both** a usable store has been chosen **and** the secrets have been saved — the two halves of onboarding. Because the secrets live in the operating system's credential store, no network is needed to set up or to use the application afterwards.
- **Verification approach**: Consistent with the client's direction and the previous module, acceptance is verified by exercising the application end to end; no automated tests are to be written for this feature, and the existing frontend tests must keep passing.
- **Scope boundary**: In scope: keeping the application fully offline, recording local changes, publishing them (Push), bringing others' changes in (Sync), automatic sync on start and hourly, the close-time safeguard for un-published work, clear outcomes and a progress indicator for every attempt, the header storage indicator, **the secrets onboarding that parses the partner's env file and saves the values into Windows Credential Manager**, and convergence of all connected computers through the one central cloud copy without duplication. Out of scope: binary file storage and transfer, any cloud provider other than Turso Cloud, and any change to how statements, bills and customers behave apart from their values being exchanged.
