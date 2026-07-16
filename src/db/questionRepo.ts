import { db } from "./connect";
import { QuestionStyle, TicketQuestion } from "../types/ticket";

export const MAX_QUESTIONS = 5;

function rowToQuestion(row: any): TicketQuestion {
  return {
    id: row.id,
    guildId: row.guild_id,
    typeKey: row.type_key,
    internalKey: row.internal_key,
    position: row.position,
    label: row.label,
    placeholder: row.placeholder,
    inputStyle: row.input_style,
    required: row.required !== 0,
    enabled: row.enabled !== 0,
  };
}

/** Active (enabled) questions for a type, in display order. */
export function getQuestions(guildId: string, typeKey: string): TicketQuestion[] {
  const rows = db
    .prepare(
      `SELECT * FROM ticket_questions
       WHERE guild_id = ? AND type_key = ? AND enabled = 1
       ORDER BY position ASC`
    )
    .all(guildId, typeKey) as any[];
  return rows.map(rowToQuestion);
}

export function getQuestionById(id: number): TicketQuestion | null {
  const row = db.prepare(`SELECT * FROM ticket_questions WHERE id = ?`).get(id) as any;
  return row ? rowToQuestion(row) : null;
}

function randomKey(): string {
  return `q_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export interface NewQuestion {
  label: string;
  placeholder: string | null;
  inputStyle: QuestionStyle;
  required: boolean;
}

/**
 * Appends a question. Returns null if the type already has MAX_QUESTIONS active
 * questions. Runs in a transaction so simultaneous adds can't exceed the cap.
 */
export function addQuestion(
  guildId: string,
  typeKey: string,
  q: NewQuestion
): TicketQuestion | null {
  const tx = db.transaction((): TicketQuestion | null => {
    const count = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM ticket_questions WHERE guild_id = ? AND type_key = ? AND enabled = 1`
        )
        .get(guildId, typeKey) as { c: number }
    ).c;
    if (count >= MAX_QUESTIONS) return null;

    const now = Date.now();
    const info = db
      .prepare(
        `INSERT INTO ticket_questions
           (guild_id, type_key, internal_key, position, label, placeholder, input_style, required, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(guildId, typeKey, randomKey(), count, q.label, q.placeholder, q.inputStyle, q.required ? 1 : 0, now, now);
    return getQuestionById(info.lastInsertRowid as number);
  });
  return tx();
}

export function updateQuestion(id: number, q: NewQuestion): void {
  db.prepare(
    `UPDATE ticket_questions
     SET label = ?, placeholder = ?, input_style = ?, required = ?, updated_at = ?
     WHERE id = ?`
  ).run(q.label, q.placeholder, q.inputStyle, q.required ? 1 : 0, Date.now(), id);
}

/** Removes a question and re-packs positions so they stay contiguous. */
export function removeQuestion(guildId: string, typeKey: string, id: number): boolean {
  const tx = db.transaction((): boolean => {
    const info = db.prepare(`DELETE FROM ticket_questions WHERE id = ?`).run(id);
    if (info.changes === 0) return false;
    repackPositions(guildId, typeKey);
    return true;
  });
  return tx();
}

/** Moves a question one step up or down among the active questions. */
export function moveQuestion(
  guildId: string,
  typeKey: string,
  id: number,
  direction: "up" | "down"
): boolean {
  const tx = db.transaction((): boolean => {
    const questions = getQuestions(guildId, typeKey);
    const index = questions.findIndex((q) => q.id === id);
    if (index === -1) return false;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= questions.length) return false;

    const a = questions[index];
    const b = questions[swapWith];
    db.prepare(`UPDATE ticket_questions SET position = ? WHERE id = ?`).run(b.position, a.id);
    db.prepare(`UPDATE ticket_questions SET position = ? WHERE id = ?`).run(a.position, b.id);
    return true;
  });
  return tx();
}

function repackPositions(guildId: string, typeKey: string): void {
  const questions = getQuestions(guildId, typeKey);
  questions.forEach((q, i) => {
    if (q.position !== i) {
      db.prepare(`UPDATE ticket_questions SET position = ? WHERE id = ?`).run(i, q.id);
    }
  });
}

/** Replaces all questions for a type with a fresh set (used by seed + reset-to-default). */
export function replaceQuestions(guildId: string, typeKey: string, questions: NewQuestion[]): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM ticket_questions WHERE guild_id = ? AND type_key = ?`).run(guildId, typeKey);
    const now = Date.now();
    questions.slice(0, MAX_QUESTIONS).forEach((q, i) => {
      db.prepare(
        `INSERT INTO ticket_questions
           (guild_id, type_key, internal_key, position, label, placeholder, input_style, required, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(guildId, typeKey, randomKey(), i, q.label, q.placeholder, q.inputStyle, q.required ? 1 : 0, now, now);
    });
  });
  tx();
}

/** Seeds default questions only if the type has none yet. */
export function seedQuestionsIfEmpty(guildId: string, typeKey: string, questions: NewQuestion[]): void {
  const count = (
    db
      .prepare(`SELECT COUNT(*) as c FROM ticket_questions WHERE guild_id = ? AND type_key = ?`)
      .get(guildId, typeKey) as { c: number }
  ).c;
  if (count === 0) replaceQuestions(guildId, typeKey, questions);
}
