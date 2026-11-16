// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//
// Read-only: print one customer row, column by column, with each value's length.
// Used to spot a value the sync engine mishandles (a NUL, an unusual character,
// an over-long value, a NULL, and so on).
//
//   node customers-check/row.mjs "Shawan Pharma"

import { createClient } from "@libsql/client";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const name = process.argv[2] ?? "Shawan Pharma";

if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.");
  process.exit(2);
}

const db = createClient({ url, authToken });

const result = await db.execute({
  sql: "SELECT * FROM customers WHERE name = ?1",
  args: [name],
});

if (result.rows.length === 0) {
  console.log(`No customer named ${JSON.stringify(name)}`);
} else {
  for (const row of result.rows) {
    for (const [key, value] of Object.entries(row)) {
      const text = value === null ? "" : String(value);
      // Show control characters explicitly so a stray byte is visible.
      const escaped = JSON.stringify(value)?.replace(/\\u0000/g, "<NUL>");
      console.log(
        `${key}: type=${value === null ? "null" : typeof value} len=${text.length} value=${escaped}`,
      );
    }
    console.log("---");
  }
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
