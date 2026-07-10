import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

const dir = path.dirname(config.databasePath);
if (dir && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    review_channel_id TEXT,
    log_channel_id TEXT,
    staff_role_id TEXT
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    style TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    placeholder TEXT
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    answers TEXT NOT NULL,
    review_message_id TEXT,
    submitted_at INTEGER NOT NULL,
    decided_at INTEGER,
    decided_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_applications_guild_user ON applications (guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_questions_guild ON questions (guild_id, position);
`);

export type QuestionStyle = "short" | "paragraph";

export interface GuildConfig {
  guildId: string;
  reviewChannelId: string | null;
  logChannelId: string | null;
  staffRoleId: string | null;
}

export interface Question {
  id: number;
  guildId: string;
  position: number;
  label: string;
  style: QuestionStyle;
  required: boolean;
  placeholder: string | null;
}

export interface AnswerSnapshot {
  question: string;
  answer: string;
}

export type ApplicationStatus = "pending" | "approved" | "denied";

export interface Application {
  id: number;
  guildId: string;
  userId: string;
  username: string;
  status: ApplicationStatus;
  answers: AnswerSnapshot[];
  reviewMessageId: string | null;
  submittedAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
}

function rowToQuestion(row: any): Question {
  return {
    id: row.id,
    guildId: row.guild_id,
    position: row.position,
    label: row.label,
    style: row.style,
    required: !!row.required,
    placeholder: row.placeholder,
  };
}

function rowToApplication(row: any): Application {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    username: row.username,
    status: row.status,
    answers: JSON.parse(row.answers),
    reviewMessageId: row.review_message_id,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

export function getGuildConfig(guildId: string): GuildConfig {
  const row = db
    .prepare(`SELECT * FROM guild_config WHERE guild_id = ?`)
    .get(guildId) as any;
  if (!row) {
    return {
      guildId,
      reviewChannelId: null,
      logChannelId: null,
      staffRoleId: null,
    };
  }
  return {
    guildId: row.guild_id,
    reviewChannelId: row.review_channel_id,
    logChannelId: row.log_channel_id,
    staffRoleId: row.staff_role_id,
  };
}

export function updateGuildConfig(
  guildId: string,
  fields: Partial<Omit<GuildConfig, "guildId">>
): GuildConfig {
  const current = getGuildConfig(guildId);
  const merged = { ...current, ...fields };
  db.prepare(
    `INSERT INTO guild_config (guild_id, review_channel_id, log_channel_id, staff_role_id)
     VALUES (@guildId, @reviewChannelId, @logChannelId, @staffRoleId)
     ON CONFLICT(guild_id) DO UPDATE SET
       review_channel_id = excluded.review_channel_id,
       log_channel_id = excluded.log_channel_id,
       staff_role_id = excluded.staff_role_id`
  ).run(merged);
  return merged;
}

export function getQuestions(guildId: string): Question[] {
  const rows = db
    .prepare(
      `SELECT * FROM questions WHERE guild_id = ? ORDER BY position ASC`
    )
    .all(guildId) as any[];
  return rows.map(rowToQuestion);
}

export function addQuestion(
  guildId: string,
  label: string,
  style: QuestionStyle,
  required: boolean,
  placeholder: string | null
): Question {
  const existing = getQuestions(guildId);
  const position = existing.length;
  const info = db
    .prepare(
      `INSERT INTO questions (guild_id, position, label, style, required, placeholder)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, position, label, style, required ? 1 : 0, placeholder);
  return rowToQuestion(
    db.prepare(`SELECT * FROM questions WHERE id = ?`).get(info.lastInsertRowid)
  );
}

export function removeQuestion(guildId: string, position: number): boolean {
  const existing = getQuestions(guildId);
  const target = existing.find((q) => q.position === position);
  if (!target) return false;

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM questions WHERE id = ?`).run(target.id);
    const remaining = db
      .prepare(
        `SELECT * FROM questions WHERE guild_id = ? ORDER BY position ASC`
      )
      .all(guildId) as any[];
    remaining.forEach((row, index) => {
      db.prepare(`UPDATE questions SET position = ? WHERE id = ?`).run(
        index,
        row.id
      );
    });
  });
  tx();
  return true;
}

export function reorderQuestion(
  guildId: string,
  fromPosition: number,
  toPosition: number
): boolean {
  const existing = getQuestions(guildId);
  if (
    fromPosition < 0 ||
    fromPosition >= existing.length ||
    toPosition < 0 ||
    toPosition >= existing.length
  ) {
    return false;
  }
  if (fromPosition === toPosition) return true;

  const reordered = [...existing];
  const [moved] = reordered.splice(fromPosition, 1);
  reordered.splice(toPosition, 0, moved);

  const tx = db.transaction(() => {
    reordered.forEach((question, index) => {
      db.prepare(`UPDATE questions SET position = ? WHERE id = ?`).run(
        index,
        question.id
      );
    });
  });
  tx();
  return true;
}

export function createApplication(
  guildId: string,
  userId: string,
  username: string,
  answers: AnswerSnapshot[]
): Application {
  const info = db
    .prepare(
      `INSERT INTO applications (guild_id, user_id, username, status, answers, submitted_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`
    )
    .run(guildId, userId, username, JSON.stringify(answers), Date.now());
  return rowToApplication(
    db
      .prepare(`SELECT * FROM applications WHERE id = ?`)
      .get(info.lastInsertRowid)
  );
}

export function getPendingApplication(
  guildId: string,
  userId: string
): Application | null {
  const row = db
    .prepare(
      `SELECT * FROM applications WHERE guild_id = ? AND user_id = ? AND status = 'pending'
       ORDER BY submitted_at DESC LIMIT 1`
    )
    .get(guildId, userId) as any;
  return row ? rowToApplication(row) : null;
}

export function getApplication(id: number): Application | null {
  const row = db
    .prepare(`SELECT * FROM applications WHERE id = ?`)
    .get(id) as any;
  return row ? rowToApplication(row) : null;
}

export function setReviewMessageId(id: number, messageId: string): void {
  db.prepare(`UPDATE applications SET review_message_id = ? WHERE id = ?`).run(
    messageId,
    id
  );
}

export function decideApplication(
  id: number,
  status: "approved" | "denied",
  decidedBy: string
): Application | null {
  db.prepare(
    `UPDATE applications SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?`
  ).run(status, Date.now(), decidedBy, id);
  return getApplication(id);
}

export function getApplicationsForUser(
  guildId: string,
  userId: string
): Application[] {
  const rows = db
    .prepare(
      `SELECT * FROM applications WHERE guild_id = ? AND user_id = ? ORDER BY submitted_at DESC`
    )
    .all(guildId, userId) as any[];
  return rows.map(rowToApplication);
}
