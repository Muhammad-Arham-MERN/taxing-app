بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ

# AGENTS.md — Agent Entry Point

> Cross-tool entry point for AI coding agents (Codex, opencode, Cursor, Amp, and others). Claude Code–specific rules live in `CLAUDE.md`; this file covers the essentials every agent needs.

## Start here

**`PROJECT_MAP.md`** at the repo root is the single entry point ("lobby") for the entire project — it maps every folder, file and function with references.

1. **Read `PROJECT_MAP.md` before exploring the codebase.** Do not do a full cross-project scan; the map is the index.
2. **Keep it in sync.** Whenever you add, rename, move or delete a folder, file, function, Tauri command, schema element or repository interface, **update `PROJECT_MAP.md` in the same change** (see its §10 "Maintenance Protocol").
3. **Bump the "Last verified" date** in `PROJECT_MAP.md` after editing it.

## Project at a glance

- **What:** offline-first desktop app for income/expenditure statements, customer bills/invoices, and clients.
- **Stack:** Tauri v2 — Rust 2021 backend (`tax-statements-analysis/src-tauri`) + React 19 / TypeScript frontend (`tax-statements-analysis/src`) + Vite.
- **Store:** a single `tax-statements.sqlite` file via the `turso` crate (schema v6); cloud sync is optional (Turso Sync, Push/Pull).
- **Specs & governance:** `specs/` (per-feature specs), `.specify/memory/constitution.md` (project constitution), `history/prompts/` (Prompt History Records).
- **Commands:** `npm run dev`, `npm run build`, `npm test` (frontend); `npm run tauri build` / `cargo` (desktop).

## Non-negotiables (from the project constitution)

- Every file opens with `بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ`, marks critical code with `وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ`, and closes with `وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ`.
- Prefer the smallest viable change; keep business requirements separate from technical design.
- Never hardcode secrets; cloud secrets live only in Windows Credential Manager.
- Read `PROJECT_MAP.md` first; update it with every structural change.

وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
