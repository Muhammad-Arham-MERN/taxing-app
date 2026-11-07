// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//
// Cloud migration: add `bill_items.crossed_minor` to the central Turso Cloud
// database (client request — an optional value shown struck through beside an
// item's amount).
//
// This is the **cloud half** of an *additive* change. The application adds the
// same column to each machine's local store on open
// (`store::schema::ensure_bill_item_crossed_column`). Because the column is
// purely additive, **nothing bumps the schema version**: an older build opening
// a newer store simply ignores the column instead of refusing the file. See
// `../../DATABASE_MIGRATIONS.md` for why.
//
// Idempotent: a table that already has the column is skipped, so a second run is
// a no-op and an interrupted run can simply be run again.
//
//   node bill-items-crossed/migrate.mjs
//
// Needs only TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (no object storage).

import { createClient } from "@libsql/client";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(2);
  }
  return value;
}

const db = createClient({
  url: requireEnv("TURSO_DATABASE_URL"),
  authToken: requireEnv("TURSO_AUTH_TOKEN"),
});

async function columnExists(table, column) {
  try {
    const result = await db.execute(`PRAGMA table_info(${table})`);
    return result.rows.some((row) => row.name === column);
  } catch {
    return false;
  }
}

async function main() {
  if (await columnExists("bill_items", "crossed_minor")) {
    console.log("· bill_items.crossed_minor is already present — nothing to do");
    return;
  }

  await db.execute("ALTER TABLE bill_items ADD COLUMN crossed_minor INTEGER");
  console.log("· bill_items.crossed_minor added");

  // The schema version marker is deliberately left unchanged: this change is
  // additive and no machine's version moves.
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
