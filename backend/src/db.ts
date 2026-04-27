import pg from "pg";
import { AppConfig, AppEntity } from "./types.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/app_generator"
});

function toSqlType(type: string): string {
  switch (type) {
    case "number":
      return "DOUBLE PRECISION";
    case "boolean":
      return "BOOLEAN";
    case "date":
      return "TIMESTAMP";
    default:
      return "TEXT";
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

export async function ensureCoreTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      event_name TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export async function ensureEntityTable(entity: AppEntity) {
  const tableName = `entity_${sanitize(entity.name)}`;
  const columns = entity.fields
    .map((f) => `"${sanitize(f.key)}" ${toSqlType(f.type)} ${f.required ? "NOT NULL" : ""}`)
    .join(",\n");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
      ${columns ? "," : ""}
      ${columns}
    );
  `);
}

export async function ensureTablesFromConfig(config: AppConfig) {
  await ensureCoreTables();
  for (const entity of config.entities) {
    await ensureEntityTable(entity);
  }
}

export function entityTableName(entityName: string): string {
  return `entity_${sanitize(entityName)}`;
}
