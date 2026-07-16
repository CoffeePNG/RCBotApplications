import { db } from "./connect";
import { Participant } from "../types/ticket";

function rowToParticipant(row: any): Participant {
  return {
    ticketId: row.ticket_id,
    userId: row.user_id,
    addedBy: row.added_by,
    addedAt: row.added_at,
    active: row.active !== 0,
  };
}

/** Adds a participant. Returns false if they're already an active participant. */
export function addParticipant(ticketId: number, userId: string, addedBy: string): boolean {
  const tx = db.transaction((): boolean => {
    const existing = db
      .prepare(`SELECT active FROM ticket_participants WHERE ticket_id = ? AND user_id = ?`)
      .get(ticketId, userId) as { active: number } | undefined;
    if (existing?.active) return false;

    db.prepare(
      `INSERT INTO ticket_participants (ticket_id, user_id, added_by, added_at, active)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(ticket_id, user_id) DO UPDATE SET added_by = excluded.added_by, added_at = excluded.added_at, active = 1`
    ).run(ticketId, userId, addedBy, Date.now());
    return true;
  });
  return tx();
}

export function removeParticipant(ticketId: number, userId: string): boolean {
  const info = db
    .prepare(`UPDATE ticket_participants SET active = 0 WHERE ticket_id = ? AND user_id = ? AND active = 1`)
    .run(ticketId, userId);
  return info.changes > 0;
}

export function isActiveParticipant(ticketId: number, userId: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM ticket_participants WHERE ticket_id = ? AND user_id = ? AND active = 1`)
    .get(ticketId, userId);
  return !!row;
}

export function getActiveParticipants(ticketId: number): Participant[] {
  const rows = db
    .prepare(`SELECT * FROM ticket_participants WHERE ticket_id = ? AND active = 1`)
    .all(ticketId) as any[];
  return rows.map(rowToParticipant);
}
