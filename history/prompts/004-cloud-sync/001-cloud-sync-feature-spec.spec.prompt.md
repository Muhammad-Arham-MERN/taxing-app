---
id: 001
title: Cloud Sync Feature Spec
stage: spec
date: 2026-10-15
surface: agent
model: unspecified
feature: 004-cloud-sync
branch: 004-cloud-sync
user: H.A.R
command: /sp.specify
labels: ["spec", "module-4", "cloud-sync", "offline-first", "turso", "sync", "storage-indicator"]
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

/sp.specify

This specification is being written to enhance the functionality of our current App.
It is a major feature of "Offline Work - Communicate Live"
The feature requires this:

- The app when installed on other computers, should communicate with other computer's personal database and involve a sort of integrity that all data remains constant accross different computers
- The app itself must not require internet, its offline architecture remains
- Keeping the cost minimal and extra sophistication was a challenge to be met using online - offline - cost effectiveness
- If the data of one computer updates, the update is made locally but the other computers are also updated with it

To implement this feature here is a higher level overview:

1. Keep functioning of application offline, users create, update and delete offline
2. store the operations performed by user offline
3. when we get internet access only then publish them to other computers to remain in sync and also push operations done by other computers to this computer to update its data
4. Data remains integral, duplication should not occur

Now the important thing is keeping record of data changes locally and then sending them to cloud and translating them to other computers, The solution I have built in detail, lets dive in:

1. The most important point for you to study right now is D:\Agentic_AI\tax-input-system\tax-statements-analysis\src-tauri\sync-poc
2. The above mentioned directory contains the entire flow of execution as a proof of concept, which is a test idea of how it is actually going to be implemented. I would like you to make sure that you study this in depth before going through the subsequent specifications
3. There are 2 computers Computer_A and Computer_B
4. The Computer_A will make some changes, and we will be using turso to record those changes as turso is a specialized opensoruce library for unlimited-individual database management
5. All the read-write-delete updates will be stored and kept in by turso when everything is offlien
6. When Computer_A finishes their work they can push and use the Push() function by turso when internet is available to push their data to turso cloud
7. We will keep only text in turso cloud because turso gives us only 5GB free and cost factor is quite high with turso, so in a future specification we will also hold raw binary files which can be very expensive size-wise so for that i have prepared a solution in our POC as well where we only store the reference as text in our turso cloud and when pull the data we use the turso file reference and use it to locate and download from oracle cloud
8. We will store fiels in Oracle Cloud Object Storage because it has a lot of storage for free 10GB and very cheap per GB storage
9. We are currently in our implementation know not using any sorts of files, only bills which we create as pdf on demand not store them anywhere, but in a future specification after this live communication between Computer_A and Computer_B feature will make a final feature for the user that requires files, so that is why the files is already handled beforehand

Current Workflow:

1. We need to implement Turso's Storage System in our current Data Storage Flow, Upgrading our current local storage with cloud storage as well
2. All the users which have this application installed will have access to sync themselves with cloud of turso
3. We are currently implementing only Turso Cloud not Oracle because it is right now not needed
4. Turso's Push and Pull will be implemented in following manner
  - There should be a button on header of App saying Push which pushes our current data changes to cloud if there is internet
  - When user makes changes and closes the app, the app opens a warning popup to push changes before closing app
  - Pull will be called "Sync" button on Header which will call latest changes from Turso cloud to our application if there is internet
  - When app starts if there is internet Sync Pull will work automatically pulling data from cloud
  - Also a programatic pull of 1 hour, that is after each 1 hour if there is internet request a pull see if any new data is added then add it to database localdb
5. use the Turso Usage API https://docs.turso.tech/api-reference/databases/usage and retrieve the amount of bytes that is left, our total limit is 5GB and at the top header should list Turso Cloud with a nice purple colored loader that indicates the amount of storage left on cloud
6. If there are 2 contradicting datas, they should also be incorporated because i dont know how they should be handled, i have asked the client
7. Push and Pull requests should be given clear indication messages so the user can understand them which may include
  - Some Server Error: Server not responding, Server unavailable, Server not configured etc
  - Some Data Error: Data malformed - in such case the malformed data should not be sent and removed from turso push queue and inform to user
  - Internet Error: Iternet not available etc
8. Write no tests

Important Docs [https://docs.turso.tech/turso-cloud, and the File Directory I mentioned Above]

## Response snapshot

Created feature branch `004-cloud-sync` (next number after 003) and wrote a full specification at `specs/004-cloud-sync/spec.md`, after studying the proof-of-concept at `tax-statements-analysis/src-tauri/sync-poc` (lib.rs, main.rs, put_file.rs, get_file.rs, Cargo.toml, env template) in depth and the Turso Cloud docs (overview + Usage API). The spec covers: an offline-first foundation that never depends on the network; a shared, text-only cloud copy as the point of exchange; a header **Push** action; a header **Sync** (pull) action; automatic Sync on start and about hourly; a close-time **warning** offering to push un-published changes; a purple **"Turso Cloud"** storage-left indicator in the header; and clear, distinguishable outcomes for every attempt (success, nothing new, no internet, not configured, server unavailable, malformed data). Scope: statements, bills and customers as text only; binary files, Oracle Object Storage and alternate cloud providers are deferred. Generated `checklists/requirements.md`. Recorded 3 open clarifications (sharing scope, conflict reconciliation, close-with-un-pushed-work behaviour) pending the client.

## Outcome

- ✅ Impact: Module 4 (Offline Work — Communicate Live / Cloud Sync) specification drafted on branch `004-cloud-sync`, ready for clarification then planning.
- 🧪 Tests: none (specification work; client directed "write no tests")
- 📁 Files: specs/004-cloud-sync/spec.md, specs/004-cloud-sync/checklists/requirements.md
- 🔁 Next prompts: resolve the 3 clarifications, then `/sp.plan`
- 🧠 Reflection: The proof-of-concept made the intended mechanism concrete (local-first text rows synced via Turso push/pull, file bytes referenced by key into Oracle), which let the spec stay behaviour-focused while still honouring the client's deliberate design: local store is the working copy, cloud is only the exchange point, text only for now. The only genuine ambiguities worth marking were sharing scope, conflict handling (the client explicitly deferred it) and whether closing is blocked when un-pushed work cannot be pushed.

## Evaluation notes (flywheel)

- Failure modes observed: none. The feature-file creation script pre-creates spec.md from the template, so the file must be read before it can be overwritten.
- Graders run and results (PASS/FAIL): spec quality checklist — PASS except the 3 intentional [NEEDS CLARIFICATION] items
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): resolve the 3 clarifications in the spec, then proceed to `/sp.plan`.
