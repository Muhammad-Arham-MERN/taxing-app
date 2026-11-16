// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//
// Cloud migration: add the bills' and clients' new nullable columns to the
// central Turso Cloud database (client request).
//
//   bills.paid_on        — the View Bills status (NULL = unpaid, a date = paid)
//   bills.meezan_iban    — the first bank's editable invoice-footer value
//   bills.js_iban        — the second bank's editable invoice-footer value
//   clients.address      — the client's own Customer Details
//   clients.contact_person
//   clients.ntn
//
// This is the **cloud half** of an *additive* change. The application adds the
// same columns to each machine's local store on open
// (`store::schema::ensure_bill_payment_columns` / `ensure_client_detail_columns`).
// Because the columns are purely additive, **nothing bumps the schema version**:
// an older build opening a newer store simply ignores them instead of refusing
// the file. See `../../DATABASE_MIGRATIONS.md` for why.
//
// Idempotent: a table that already has a column is skipped, so a second run is a
// no-op and an interrupted run can simply be run again.
//
//   node bills-clients-fields/migrate.mjs
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

/** The columns to add, grouped by table. */
const COLUMNS = {
  bills: ["paid_on", "meezan_iban", "js_iban"],
  clients: ["address", "contact_person", "ntn"],
};

async function columnExists(table, column) {
  try {
    const result = await db.execute(`PRAGMA table_info(${table})`);
    return result.rows.some((row) => row.name === column);
  } catch {
    return false;
  }
}

async function main() {
  for (const [table, columns] of Object.entries(COLUMNS)) {
    for (const column of columns) {
      if (await columnExists(table, column)) {
        console.log(`· ${table}.${column} is already present — nothing to do`);
        continue;
      }
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
      console.log(`· ${table}.${column} added`);
    }
  }

  // The schema version marker is deliberately left unchanged: this change is
  // additive and no machine's version moves.
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
