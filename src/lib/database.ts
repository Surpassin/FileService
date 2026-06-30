import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

const DB_PATH = process.env.DATABASE_PATH || "./data/omnii.db";

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  const database = db;

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'custom',
      status TEXT NOT NULL DEFAULT 'offline',
      config TEXT NOT NULL DEFAULT '{}',
      metrics TEXT NOT NULL DEFAULT '{"totalRuns":0,"successfulRuns":0,"failedRuns":0,"averageLatencyMs":0,"lastRunAt":null,"uptimePercent":0}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      metadata TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_by TEXT NOT NULL,
      used_by TEXT,
      used_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (used_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON agent_logs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_timestamp ON agent_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
  `);

  seedAdminUser(database);
}

function seedAdminUser(database: Database.Database) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@omnii.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme";

  const existing = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(adminEmail);

  if (!existing) {
    const id = uuidv4();
    const hash = bcrypt.hashSync(adminPassword, 12);
    database
      .prepare(
        "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, adminEmail, "Admin", hash, "admin");
    console.log(`[DB] Admin user created: ${adminEmail}`);
  }
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  return getDatabase().prepare(sql).all(...params) as T[];
}

export function queryOne<T>(
  sql: string,
  params: unknown[] = []
): T | undefined {
  return getDatabase().prepare(sql).get(...params) as T | undefined;
}

export function execute(
  sql: string,
  params: unknown[] = []
): Database.RunResult {
  return getDatabase().prepare(sql).run(...params);
}
