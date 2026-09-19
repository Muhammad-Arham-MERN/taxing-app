---
id: 006
title: Tauri Updater Not Updating Diagnosis
stage: misc
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["tauri", "updater", "release", "github-releases", "diagnosis"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - tax-statements-analysis/src-tauri/tauri.conf.json
 - tax-statements-analysis/src-tauri/Cargo.toml
 - tax-statements-analysis/src-tauri/Cargo.lock
 - tax-statements-analysis/package.json
tests:
 - anonymous GET of the updater endpoint (HTTP 200 after the fix)
 - gh release view / gh release download latest.json
---

## Prompt

also now that this is done, i did the updations system from tauri, installing it in on my computer and pushing new updates by tagging to see if i get update dialog or updates in my app, it did not show me, for more details you can look a small .md file here RELEASING.md this file i used to make my commands to create a tag, but i cant see those updates, my installer exists in tauri build standard folder

## Response snapshot

Diagnosed two independent blockers with evidence from the published release and repository, then applied the version fix.

1. **Version never bumped.** `latest.json` in `app-v1.1` declared `"version": "0.1.0"` with assets named `..._0.1.0_x64-setup.exe`; `tauri.conf.json` was still `0.1.0`, and the installed client is `0.1.0`. `latest.json` is generated from `tauri.conf.json`, not the tag, so both releases announced the installed version and the updater correctly did nothing. Fixed by bumping `tauri.conf.json`, `Cargo.toml` and `package.json` to `0.1.1` (Cargo.lock synced; `cargo check` clean).
2. **Repo was private.** `gh repo view … --json isPrivate` returned `true`, and an anonymous fetch of the endpoint returned 404, so the updater's unauthenticated GET could never reach `latest.json`. The client made the repo public; re-verified the endpoint returns **HTTP 200 anonymously**.

Also noted that there is **no update dialog by design** (`download_and_install` + `installMode: passive`), and that failures are only `eprintln!`, invisible in a windowless release build. The client chose to keep the existing silent behaviour, so no code changed there.

## Outcome

- ✅ Impact: the updater's two blockers are resolved; the next tag will announce `0.1.1` and an installed `0.1.0` will update.
- 🧪 Tests: `cargo check` clean; endpoint verified 200 anonymously.
- 📁 Files: tauri.conf.json, Cargo.toml, Cargo.lock, package.json (version → 0.1.1).
- 🔁 Next prompts: commit, push main, tag `app-v0.1.1`, push the tag; then confirm `latest.json` reads `0.1.1` and the installed app relaunches as 0.1.1.
- 🧠 Reflection: the release was publishing perfectly while nothing reached clients, because the number that matters (`tauri.conf.json` version) never moved and the asset URL was auth-gated. Both failed silently — exactly the two failure modes RELEASING.md warns about.

## Evaluation notes (flywheel)

- Failure modes observed: tag names (`app-v1.0`, `app-v1.1`) did not match the config version, which is irrelevant to the updater but masked the real problem.
- Graders run and results (PASS/FAIL): endpoint reachability PASS after the visibility change.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add the log-file line to `updater.rs` so future failures are diagnosable in the field.
