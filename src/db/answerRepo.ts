import { db } from "./connect";
import { TicketAnswer, TicketQuestion } from "../types/ticket";

function rowToAnswer(row: any): TicketAnswer {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    questionInternalKey: row.question_internal_key,
    questionLabel: row.question_label_snapshot,
    questionPosition: row.question_position_snapshot,
    answer: row.answer,
  };
}

/** Stores answers with a snapshot of each question's wording/position at submission time. */
export function saveAnswers(
  ticketId: number,
  entries: { question: TicketQuestion; answer: string }[]
): void {
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      `INSERT INTO ticket_answers
         (ticket_id, question_internal_key, question_label_snapshot, question_position_snapshot, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const now = Date.now();
    for (const { question, answer } of entries) {
      stmt.run(ticketId, question.internalKey, question.label, question.position, answer, now);
    }
  });
  tx();
}

export function getAnswers(ticketId: number): TicketAnswer[] {
  const rows = db
    .prepare(
      `SELECT * FROM ticket_answers WHERE ticket_id = ? ORDER BY question_position_snapshot ASC`
    )
    .all(ticketId) as any[];
  return rows.map(rowToAnswer);
}
