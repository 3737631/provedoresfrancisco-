import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOCAL_DB_PATH } from "@/lib/config";

// ============================================================
//  Almacen local con SQLite (node:sqlite, sin dependencias).
//  Espejo del schema de Supabase (supabase/migrations/0001_init.sql).
// ============================================================

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  db = new DatabaseSync(LOCAL_DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      product_id TEXT,
      name TEXT,
      image_url TEXT,
      seller_name TEXT,
      seller_store_url TEXT,
      manufacturer_name TEXT,
      manufacturer_address TEXT,
      manufacturer_email TEXT,
      manufacturer_phone TEXT,
      eu_responsible TEXT,
      price TEXT,
      currency TEXT,
      variants TEXT DEFAULT '[]',
      shipping_info TEXT,
      compliance_contacts TEXT DEFAULT '[]',
      raw_analysis TEXT DEFAULT '{}',
      extraction_method TEXT,
      extraction_status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT,
      company TEXT,
      contact_type TEXT NOT NULL,
      email TEXT,
      website TEXT,
      phone TEXT,
      source TEXT,
      confidence TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS manufacturer_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT,
      manufacturer_name TEXT,
      title TEXT,
      url TEXT,
      kind TEXT,
      snippet TEXT,
      email TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT,
      contact_id TEXT,
      company TEXT,
      product_name TEXT,
      contact_email TEXT,
      contact_type TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente',
      notes TEXT,
      first_contact_date TEXT,
      last_message TEXT,
      next_follow_up TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT,
      contact_id TEXT,
      supplier_id TEXT,
      to_email TEXT,
      to_company TEXT,
      subject TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      gmail_message_id TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gmail_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      gmail_user_email TEXT,
      access_token_enc TEXT,
      refresh_token_enc TEXT,
      expires_at TEXT,
      watch_expiration TEXT,
      history_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      supplier_id TEXT,
      gmail_message_id TEXT UNIQUE,
      thread_id TEXT,
      from_email TEXT,
      from_name TEXT,
      subject TEXT,
      body TEXT,
      received_at TEXT,
      summary TEXT,
      classification TEXT DEFAULT '{}',
      suggested_reply TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      body TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS captures (
      url TEXT PRIMARY KEY,
      html TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migracion: columna to_company en emails (bases ya creadas)
  try {
    d.exec("ALTER TABLE emails ADD COLUMN to_company TEXT");
  } catch {
    /* la columna ya existe */
  }
}

export const now = () => new Date().toISOString();
export const uid = () => randomUUID();

type Row = Record<string, unknown>;

function insert(table: string, data: Record<string, unknown>): Row {
  const d = getDb();
  const keys = Object.keys(data);
  const cols = keys.join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => toDb(data[k]));
  d.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(...values);
  const row = selectById(table, data.id as string);
  return row;
}

function selectById(table: string, id: string): Row {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
  return fromDb(row);
}

function toDb(v: unknown): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export function fromDb(row: Row | undefined | null): Row {
  if (!row) return {} as Row;
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string") {
      if (/^(variants|compliance_contacts|raw_analysis|metadata|classification)$/.test(k)) {
        try {
          out[k] = JSON.parse(v);
          continue;
        } catch {
          /* dejar como texto */
        }
      }
    }
    out[k] = v;
  }
  if ("is_read" in out) out.is_read = Boolean(out.is_read);
  return out;
}

export const localDb = {
  get: getDb,
  insert,
  uid,
  now,
  fromDb,
  toDb,
  raw: (sql: string, ...params: any[]) => {
    const d = getDb();
    const stmt = d.prepare(sql);
    const rows = stmt.all(...params.map(toDb)) as Row[];
    return rows.map(fromDb);
  },
  rawGet: (sql: string, ...params: any[]) => {
    const d = getDb();
    const row = d.prepare(sql).get(...params.map(toDb)) as Row | undefined;
    return fromDb(row);
  },
  rawRun: (sql: string, ...params: any[]) => {
    const d = getDb();
    return d.prepare(sql).run(...params.map(toDb));
  },
  update: (table: string, id: string, fields: Record<string, unknown>) => {
    const d = getDb();
    const keys = Object.keys(fields);
    if (keys.length === 0) return selectById(table, id);
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => toDb(fields[k]));
    d.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...values, id);
    return selectById(table, id);
  },
  remove: (table: string, id: string) => {
    const d = getDb();
    d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  },
  reset: () => {
    db?.close();
    db = null;
  },
};