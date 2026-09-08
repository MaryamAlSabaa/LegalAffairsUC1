import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "dotenv/config";

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const schema = await fs.promises.readFile(path.resolve(scriptDirectory, "../db/schema.sql"), "utf8");
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and enter your PostgreSQL credentials.");
}
const databaseUrl = new URL(process.env.DATABASE_URL);
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));

if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(databaseName)) {
  throw new Error("DATABASE_URL contains an unsupported database name.");
}

const ssl = String(process.env.DATABASE_SSL || "false").toLowerCase() === "true" ? { rejectUnauthorized: false } : false;
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString(), ssl });

await admin.connect();
const exists = await admin.query("select 1 from pg_database where datname = $1", [databaseName]);
if (exists.rowCount === 0) {
  await admin.query(`create database "${databaseName.replaceAll('"', '""')}"`);
  console.log(`Created PostgreSQL database ${databaseName}.`);
}
await admin.end();

const database = new Client({ connectionString: databaseUrl.toString(), ssl });
await database.connect();
await database.query(schema);
await database.end();
console.log(`Initialized ${databaseName} with the KU Legal Affairs schema.`);
