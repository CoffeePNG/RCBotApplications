import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

const dir = path.dirname(config.databasePath);
if (dir && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    mod_log_channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS ticket_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    type_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    department TEXT NOT NULL,
    channel_prefix TEXT NOT NULL,
    review_channel_id TEXT,
    open_message TEXT NOT NULL,
    claim_message TEXT NOT NULL,
    UNIQUE (guild_id, type_key)
  );

  CREATE TABLE IF NOT EXISTS ticket_leads (
    ticket_config_id INTEGER NOT NULL REFERENCES ticket_configs (id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    PRIMARY KEY (ticket_config_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    type_key TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    claimed_by TEXT,
    created_at INTEGER NOT NULL,
    claimed_at INTEGER,
    closed_at INTEGER,
    closed_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_guild_type ON tickets (guild_id, type_key);
  CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets (channel_id);

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings (guild_id, user_id);
`);
