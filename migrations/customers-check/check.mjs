// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//
// Read-only diagnostic for the customers table.
//
// It runs the two reads the bug is about, so we can see which one breaks:
//
//   1. a full scan ordered by name   (what the client/customer lists do)
//   2. a keyed lookup by name        (what a bill's customer UPSERT does on conflict)
//
// Read-only: it issues only SELECTs, so it is safe to run against the cloud
// database or a local store file.
//
//   # against the cloud database (values in Windows Credential Manager)
//   node customers-check/check.mjs
//
//   # against a local store file
//   node customers-check/check.mjs "file:D:/Agentic_AI/tax-input-system/tax-statements.sqlite"

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

const fileArg = process.argv[2];
const url = fileArg ?? requireEnv("TURSO_DATABASE_URL");
const authToken = fileArg ? undefined : requireEnv("TURSO_AUTH_TOKEN");

const db = createClient({ url, authToken });

async function main() {
  console.log(`Target: ${url}`);

  // 0. Structural health of the whole file, and the declared customers schema.
  try {
    const integrity = await db.execute("PRAGMA integrity_check");
    const verdict = integrity.rows.map((row) => Object.values(row).join(" ")).join("; ");
    console.log(`integrity_check: ${verdict}`);
  } catch (error) {
    console.log(`integrity_check: could not run (${String(error?.message ?? error)})`);
  }

  try {
    const info = await db.execute("PRAGMA table_info(customers)");
    console.log(
      `customers columns: ${info.rows.map((row) => row.name).join(", ")}`,
    );
  } catch (error) {
    console.log(`table_info: could not run (${String(error?.message ?? error)})`);
  }

  // 1. The scan the app's lists use.
  const scan = await db.execute(
    "SELECT name FROM customers ORDER BY name COLLATE NOCASE ASC",
  );
  console.log(`Scan: ${scan.rows.length} customer row(s) read`);

  // 2. The keyed lookup a customer UPSERT performs for ON CONFLICT(name).
  const bad = [];
  for (const row of scan.rows) {
    const name = row.name;
    try {
      await db.execute({ sql: "SELECT * FROM customers WHERE name = ?1", args: [name] });
    } catch (error) {
      bad.push({ name, message: String(error?.message ?? error) });
    }
  }

  if (bad.length === 0) {
    console.log("Keyed lookup: every row read cleanly");
    return;
  }

  console.log(`Keyed lookup FAILED for ${bad.length} row(s):`);
  for (const entry of bad) {
    console.log(`  - ${entry.name}: ${entry.message}`);
  }
}

main().catch((error) => {
  console.error("Diagnostic failed:", error);
  process.exit(1);
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
