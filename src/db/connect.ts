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
    mod_log_channel_id TEXT,
    panel_channel_id TEXT,
    panel_message_id TEXT,
    panel_title TEXT,
    panel_description TEXT,
    ticket_category_id TEXT
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
    option_description TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
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
    code TEXT,
    message_id TEXT,
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

  CREATE TABLE IF NOT EXISTS ticket_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    type_key TEXT NOT NULL,
    internal_key TEXT NOT NULL,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    placeholder TEXT,
    input_style TEXT NOT NULL DEFAULT 'paragraph',
    required INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (guild_id, type_key, internal_key)
  );

  CREATE INDEX IF NOT EXISTS idx_questions_guild_type ON ticket_questions (guild_id, type_key, position);

  CREATE TABLE IF NOT EXISTS ticket_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    question_internal_key TEXT,
    question_label_snapshot TEXT NOT NULL,
    question_position_snapshot INTEGER NOT NULL,
    answer TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_answers_ticket ON ticket_answers (ticket_id, question_position_snapshot);

  CREATE TABLE IF NOT EXISTS claim_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    previous_claimant TEXT,
    new_claimant TEXT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_claim_history_ticket ON claim_history (ticket_id);

  CREATE TABLE IF NOT EXISTS ticket_participants (
    ticket_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (ticket_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    ticket_id INTEGER,
    ticket_code TEXT,
    actor_id TEXT,
    target_id TEXT,
    event_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_log (guild_id, created_at);

  CREATE TABLE IF NOT EXISTS ticket_managers (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
`);

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("tickets", "message_id", "TEXT");
ensureColumn("guild_settings", "panel_channel_id", "TEXT");
ensureColumn("guild_settings", "panel_message_id", "TEXT");
ensureColumn("guild_settings", "panel_title", "TEXT");
ensureColumn("guild_settings", "panel_description", "TEXT");
ensureColumn("ticket_configs", "option_description", "TEXT");
ensureColumn("tickets", "code", "TEXT");
ensureColumn("guild_settings", "ticket_category_id", "TEXT");
ensureColumn("ticket_configs", "enabled", "INTEGER NOT NULL DEFAULT 1");
// Feature batch: structured close + shared archive channel.
ensureColumn("guild_settings", "archive_channel_id", "TEXT");
ensureColumn("tickets", "close_reason", "TEXT");
ensureColumn("tickets", "outcome", "TEXT");
ensureColumn("tickets", "archive_channel_id", "TEXT");
ensureColumn("tickets", "archive_message_id", "TEXT");
ensureColumn("tickets", "archived_at", "INTEGER");
ensureColumn("tickets", "archive_error", "TEXT");
