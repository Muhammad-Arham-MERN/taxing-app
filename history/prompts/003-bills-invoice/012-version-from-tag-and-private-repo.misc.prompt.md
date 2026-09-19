---
id: 012
title: Tag-Driven Version and Private Repo Distribution
stage: misc
date: 2026-09-19
surface: agent
model: unspecified
feature: 003-bills-invoice
branch: 003-bills-invoice
user: H.A.R
command: (ad-hoc)
labels: ["release", "ci", "updater", "github-actions", "privacy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - .github/workflows/release.yml
 - RELEASING.md
tests:
 - none (workflow/documentation change, nothing executable locally)
---

## Prompt

also you changed the versions yourself? why shouldn't they be done automatically when there is tauri build? because i implemented github actions for the reason that i just need to push updates with tag and user accesses updates while github actions do all the nasty work of building, furtermore i dont like the repository to be public, anyone can steal my work then, i like this project to be private while also allowing user to have updates

## Response snapshot

Owned the manual version bump: it was needed because Tauri takes its version from `tauri.conf.json` (never from the tag), so with the config stuck at `0.1.0` every release announced `0.1.0` to an installed `0.1.0` and did nothing. It should have been proposed rather than applied.

**Automation added.** The release workflow now stamps the version from the pushed tag before the build:

```yaml
      - name: set version from the tag
        shell: pwsh
        working-directory: tax-statements-analysis/src-tauri
        run: |
          $version = "${{ github.ref_name }}" -replace '^app-v', ''
          …validate semver, set tauri.conf.json version, write without a BOM…
```

So the loop is now `commit → push → tag → push the tag`; nothing version-related is edited by hand, and a malformed tag (e.g. `app-v1.1`) fails the build on purpose. RELEASING.md updated accordingly.

**Private repo, public updates.** Verified against the official docs/README: `tauri-action` accepts `owner` / `repo` / `releaseCommitish`, so the private repo's workflow can publish the release into a **separate public repo that holds releases only**; the endpoint then points there. The updater's `endpoints` config is URLs only — request headers exist but only via the Rust/JS updater builder (`updater_builder().header(...)`), which would mean shipping a token inside the app (extractable, so not recommended). Noted that publishing installers neither exposes source nor weakens integrity, because the `.sig` is checked against the compiled-in `pubkey`. RELEASING.md gained a "Distribution and repository privacy" section with the ready-to-use snippet.

## Outcome

- ✅ Impact: releases are driven entirely by the tag; a private source repo can serve updates through a public releases repo.
- 🧪 Tests: none — the workflow only runs on GitHub.
- 📁 Files: `.github/workflows/release.yml`, `RELEASING.md`.
- 🔁 Next prompts: decide the distribution repo (create it + a PAT secret), then wire `owner`/`repo`/`releaseCommitish`; optionally revert the manual `0.1.1` bump.
- 🧠 Reflection: the two failures were both silent-by-design — a version that never moved, and a URL that 404s for anonymous clients — which is exactly why they were hard to spot from the outside.

## Evaluation notes (flywheel)

- Failure modes observed: changing versions without asking; corrected by making the tag the source of truth.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): create the public releases repo and add `RELEASES_TOKEN`, then tag a test release (e.g. `app-v0.1.2`) and confirm `latest.json` appears and the installed app updates.
