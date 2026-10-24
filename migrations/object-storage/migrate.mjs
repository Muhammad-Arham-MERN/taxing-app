// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//
// Cloud migration: schema v7 → v8 — move every file's bytes out of the synced
// store and into Oracle Cloud (OCI) Object Storage, leaving an `object_key`
// reference behind.
//
// This is the *cloud* half of the migration. The application migrates each
// computer's local store on update; because the cloud database is shared, it is
// brought to the same shape here, once, in the same release. Running both means
// every machine converges on v8.
//
// It is idempotent: a table that no longer has a `data` column is skipped, so a
// second run is a no-op and an interrupted run can simply be run again.
//
//   node object-storage/migrate.mjs
//
// See ../README.md for the environment variables it needs.

import { createClient } from "@libsql/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

const TARGET_VERSION = 8;
const CONTENT_TYPE = "application/octet-stream";

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

const s3 = new S3Client({
  region: requireEnv("OCI_S3_REGION"),
  endpoint: requireEnv("OCI_S3_ENDPOINT"),
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireEnv("OCI_S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("OCI_S3_SECRET_ACCESS_KEY"),
  },
});

const bucket = requireEnv("OCI_S3_BUCKET");

// The sync engine owns a synced database's file header, so `PRAGMA user_version`
// reads 0 there — and the libsql HTTP protocol refuses to *write* it at all
// ("SQL not allowed statement"). The schema version as **content**, the
// `app_meta.schema_version` marker the application keeps, is the value that means
// anything on such a database, so it is read first.
async function currentVersion() {
  try {
    const result = await db.execute(
      "SELECT value FROM app_meta WHERE key = 'schema_version'",
    );
    const parsed = Number(result.rows[0]?.value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch {
    // A very old database may have no app_meta table; fall through to the header.
  }
  try {
    const result = await db.execute("PRAGMA user_version");
    return Number(result.rows[0]?.[0] ?? 0);
  } catch {
    return 0;
  }
}

async function columnExists(table, column) {
  try {
    const result = await db.execute(`PRAGMA table_info(${table})`);
    return result.rows.some((row) => row.name === column);
  } catch {
    return false;
  }
}

/** A libsql BLOB arrives as an ArrayBuffer; normalise it to a Uint8Array. */
function toBytes(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(Buffer.from(value));
}

async function migrateTable({ table, idColumn, recreateSql }) {
  if (!(await columnExists(table, "data"))) {
    console.log(`· ${table}: already migrated (no 'data' column) — nothing to do`);
    return 0;
  }

  const existing = await db.execute(
    `SELECT ${idColumn}, file_name, byte_size, data FROM ${table}`,
  );

  const references = [];
  for (const row of existing.rows) {
    const objectKey = `objects/${randomUUID()}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: toBytes(row.data),
        ContentType: CONTENT_TYPE,
      }),
    );
    references.push({
      id: String(row[idColumn]),
      fileName: row.file_name == null ? "" : String(row.file_name),
      byteSize: Number(row.byte_size ?? 0),
      objectKey,
    });
  }

  const tx = await db.transaction("write");
  try {
    await tx.execute(`DROP TABLE ${table}`);
    await tx.execute(recreateSql);
    for (const reference of references) {
      await tx.execute({
        sql: `INSERT INTO ${table} (${idColumn}, file_name, byte_size, content_type, object_key)
              VALUES (?, ?, ?, NULL, ?)`,
        args: [reference.id, reference.fileName, reference.byteSize, reference.objectKey],
      });
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  console.log(`· ${table}: ${references.length} object(s) moved to Oracle`);
  return references.length;
}

// وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ
async function main() {
  const version = await currentVersion();
  console.log(`Cloud schema is at version ${version}; target is ${TARGET_VERSION}.`);
  if (version >= TARGET_VERSION) {
    console.log("Already up to date — nothing to do.");
    return;
  }

  await migrateTable({
    table: "attachments",
    idColumn: "statement_id",
    recreateSql: `CREATE TABLE attachments (
        statement_id  TEXT    PRIMARY KEY REFERENCES statements(id) ON DELETE CASCADE,
        file_name     TEXT    NOT NULL,
        byte_size     INTEGER NOT NULL,
        content_type  TEXT,
        object_key    TEXT    NOT NULL
    ) STRICT`,
  });

  await migrateTable({
    table: "client_record_files",
    idColumn: "record_id",
    recreateSql: `CREATE TABLE client_record_files (
        record_id    TEXT    PRIMARY KEY REFERENCES client_records(id) ON DELETE CASCADE,
        file_name    TEXT    NOT NULL,
        byte_size    INTEGER NOT NULL,
        content_type TEXT,
        object_key   TEXT    NOT NULL
    ) STRICT`,
  });

  // Stamp the version last, so an interrupted run is completed by running again.
  // Only the **content marker** is written: the file header is owned by the sync
  // engine and the libsql HTTP protocol forbids writing `PRAGMA user_version`.
  await db.execute({
    sql: `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [String(TARGET_VERSION)],
  });

  console.log(`Cloud schema is now at version ${TARGET_VERSION}.`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
