بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ

# DATABASE_MIGRATIONS.md — Rules for changing the store schema

> **Audience:** any agent or developer changing the store schema (`store/schema.rs`), its DDL, `SCHEMA_VERSION`, or the cloud migration scripts under `migrations/`.
>
> **Read this before touching the schema.** The store is a **Turso Sync** local-first database: the same rows live on every computer **and** in the central Turso Cloud database. The schema is part of what syncs. A careless change can silently diverge replicas.

---

## 0. Why these rules exist (the mechanism, in one screen)

- SQLite keeps the **entire schema as data**: every table is a row in `sqlite_schema` whose `sql` column holds the literal `CREATE TABLE …` text.
- Turso Sync is **logical change-data-capture** (row-level), not page frames. A schema change is a change to a `sqlite_schema` row, so it travels the same rail as ordinary row data.
- On **pull**, the engine replays those schema ops — `DatabaseReplaySession::replay` calls `rename_and_drop_local_columns_to_match_remote` and `execute_ddl_idempotent` (see `tursodatabase/turso` issue #9529).
- That replay is **best-effort and has known bugs**. It converges a table's *structure* toward the remote's declared SQL; it is **not** a schema-diff or data-reshape engine. `execute_ddl_idempotent` against a table that already exists is a **no-op**, so an arbitrary reshape is **not** applied to that table.

**Consequence:** schema changes are authored by us, deterministically, on both sides. Sync replay is transport only — **never the plan.**

وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

---

## 1. Explicit prohibitions (MUST NOT)

1. **MUST NOT rely on Turso sync replay to apply a schema change.** The authoritative paths are the application migration (`store/schema.rs::migrate`, run on every open) and a deterministic cloud migration script under `migrations/`. Replay is a bonus, not a mechanism.
2. **MUST NOT use `ALTER TABLE … RENAME TO` (or `RENAME COLUMN`) on a synced store.** A rename changes the `sqlite_schema` row in place and writes no row changes, so the replica creates a new *empty* table and keeps the old one — silent divergence with no error (`tursodatabase/turso#9529`).
3. **MUST NOT perform a destructive or reshaping change by declaring a new `CREATE TABLE` and trusting sync.** Type changes, column drops, table splits/merges, primary/foreign-key or constraint changes, and any `DROP`/recreate of an existing table are **not** reliably reconstructed by replay. State them explicitly, with the data moved by hand.
4. **MUST NOT change an existing column's type or constraints in place** on a synced store. Add a new column and migrate values explicitly instead.
5. **MUST NOT bump `SCHEMA_VERSION` for an additive change.** A version bump is reserved for a genuinely *breaking* reshape, and it deliberately makes older builds **refuse** the store. Additive changes older builds can ignore must not bump it.
6. **MUST NOT make a schema step that needs the network.** A migration must complete fully offline (write bytes to the local cache marked pending; let `files::drain_pending` upload later).
7. **MUST NOT run a migration step without an idempotency guard.** Every step must be safe to re-run (`column_exists(…)`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), so an interrupted migration is completed by simply reopening.
8. **MUST NOT stamp the version before the work is done.** Do the DDL first, stamp `user_version` and the `app_meta.schema_version` marker **last**.
9. **MUST NOT land a schema change on one side only.** The local migration and the cloud script ship in the **same release** so every machine converges.
10. **MUST NOT push while a write/migration transaction is open,** and never have two writers reshape the same table — the store is logically single-writer.

---

## 2. The only shape of change allowed to ride sync

Additive, idempotent, backward-compatible DDL only:

- `ALTER TABLE … ADD COLUMN …` — **nullable** (or a constant default), never a non-constant one.
- `CREATE TABLE IF NOT EXISTS …`
- `CREATE INDEX IF NOT EXISTS …`

Anything beyond this list (a reshape) is done as an **explicit** `DROP`/recreate plus a hand-written data move, in both the app migration and the cloud script — exactly as the v7→v8 object-storage migration does.

---

## 3. Required pattern for any schema change

1. **Fresh-store path:** add the DDL to the appropriate `DDL*` const in `store/schema.rs` so a brand-new store is born correct.
2. **Migration path:** add a guarded step in `schema::migrate` (only where the change isn't naturally covered by `IF NOT EXISTS` / a `column_exists` check).
3. **Version decision:** additive ⇒ **do not bump** `SCHEMA_VERSION`; breaking reshape ⇒ bump it and coordinate the release so all machines update together.
4. **Cloud half:** add the equivalent idempotent SQL to a `migrations/<feature>/migrate.mjs` script, and stamp the `app_meta.schema_version` **content marker** last (the synced file header's `user_version` reads 0 and the HTTP protocol refuses to write it).
5. **CI:** ensure the `migrate` job runs before `publish` (it is currently **removed** from `.github/workflows/release.yml` — restore it when a cloud migration is needed).
6. **Map:** update `PROJECT_MAP.md` §4.5 and §8, and bump its "Last verified" date.
7. **Prove it:** for any DDL that sync must carry (notably `ADD COLUMN`), run the throwaway `sync-poc` spike to confirm *this* `turso` crate version replays it cleanly across two replicas before shipping.

---

## 4. Verification checklist

- [ ] Change is additive and idempotent, or an explicit reshape with a data move.
- [ ] No `RENAME` anywhere in the DDL.
- [ ] `SCHEMA_VERSION` bumped **only** if the change is breaking for older builds.
- [ ] Every step is guarded and safe to re-run; version stamped last.
- [ ] Migration completes with no network.
- [ ] Local migration **and** cloud script land in the same release.
- [ ] `PROJECT_MAP.md` §4.5/§8 updated; "Last verified" bumped.
- [ ] Sync replay of the new DDL verified with the `sync-poc` spike.

---

## 5. Complexity ladder — the decision aid

The mechanism never changes (§3). What scales with complexity is **how much you hand-write** and **whether the change is breaking**.

| Change | What it takes | Breaking? | Bump `SCHEMA_VERSION`? |
|---|---|---|---|
| Add a nullable column | guarded `ADD COLUMN` locally + one line in the cloud script | no — older builds ignore it | **no** |
| Add a table / index | `CREATE … IF NOT EXISTS` on both sides | no | no |
| Move / transform data (v8: BLOB → Object Storage) | explicit read–transform–rewrite, offline, resumable, both sides | usually no | sometimes |
| Reshape a table (type change, split/merge, constraint change) | `DROP`/recreate + a hand-written copy, both sides | **yes** — older builds cannot read it | **yes**, coordinate the release |
| Rename a column or table | — | — | avoid entirely (replay bug, §1.2) |

**Two levers decide everything:**

1. **Additive vs breaking** → whether you bump `SCHEMA_VERSION`, and therefore whether older builds stay welcome or are refused.
2. **Shape-only vs data-moving** → how much explicit, offline, idempotent code you must write.

**The invariant that never changes:** the app migrates each machine, a script migrates the cloud, both land in the same release, both idempotent. Replay is transport — never the plan.

---

## 6. Evidence

- `tursodatabase/turso` issue **#9529** — "MVCC sync pull does not replay `ALTER TABLE … RENAME TO`" (the replay internals: `append_schema_ops`, `rename_and_drop_local_columns_to_match_remote`, `execute_ddl_idempotent`).
- Turso docs — Rust reference (`turso` crate): sync is "logical change-data-capture rather than page frames".
- Turso blog — "How to Deploy Schema Changes to a Million Databases": the recommended pattern is **pull-based, client-applied migrations**.
- This repo — `specs/004-cloud-sync/data-model.md` §1.4 and `migrations/README.md` (the v7→v8 deterministic, both-sides migration).

وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
