import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./password";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");

export type Role = "admin" | "agent";
export type AgentStatus = "offline" | "available" | "on_call" | "break";
export const STAGES = ["new", "contacted", "interested", "follow_up", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: AgentStatus;
  last_seen: string | null;
  active: number;
}

export interface Lead {
  id: number;
  name: string;
  phone: string;
  phone_key: string;
  source: string | null;
  stage: Stage;
  assigned_to: number | null;
  next_follow_up: string | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: number;
  client_id: string;
  user_id: number;
  lead_id: number | null;
  phone: string;
  direction: "incoming" | "outgoing" | "missed" | "rejected";
  started_at: string;
  duration_sec: number;
  outcome: string | null;
  recording_file: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','agent')),
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_key TEXT NOT NULL,
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  assigned_to INTEGER REFERENCES users(id),
  next_follow_up TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS leads_phone_key ON leads(phone_key);
CREATE INDEX IF NOT EXISTS leads_assigned ON leads(assigned_to);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lead_id INTEGER REFERENCES leads(id),
  phone TEXT NOT NULL,
  direction TEXT NOT NULL,
  started_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,
  recording_file TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS calls_lead ON calls(lead_id);
CREATE INDEX IF NOT EXISTS calls_user_started ON calls(user_id, started_at);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notes_lead ON notes(lead_id);
`;

function open() {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "crm.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  const { n } = db.prepare("SELECT COUNT(*) n FROM users").get() as { n: number };
  if (n === 0) {
    const email = process.env.ADMIN_EMAIL || "admin@example.com";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    if (!process.env.ADMIN_PASSWORD) console.warn(`[crm] Created admin ${email} / ${password} — change this password now.`);
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')").run("Admin", email, hashPassword(password));
  }
  return db;
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __crmDb?: Database.Database };
export const db = g.__crmDb ?? (g.__crmDb = open());
