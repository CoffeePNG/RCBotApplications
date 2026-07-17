import { db } from "./connect";
import { ClaimAction } from "../types/ticket";

export type AuditEventType =
  | "questions_changed"
  | "ticket_created"
  | "participant_added"
  | "participant_removed"
  | ClaimAction
  | "staff_added"
  | "staff_removed"
  | "staff_left_guild"
  | "close_initiated"
  | "archive_succeeded"
  | "archive_failed"
  | "ticket_closed"
  | "ticket_reopened"
  | "ticket_deleted";

export interface AuditEntry {
  guildId: string;
  ticketId?: number | null;
  ticketCode?: string | null;
  actorId?: string | null;
  targetId?: string | null;
  eventType: AuditEventType;
  oldValue?: string | null;
  newValue?: string | null;
}

/** Records an audit event. Best-effort — never let audit failures break a flow. */
export function recordAudit(entry: AuditEntry): void {
  try {
    db.prepare(
      `INSERT INTO audit_log
         (guild_id, ticket_id, ticket_code, actor_id, target_id, event_type, old_value, new_value, created_at)
       VALUES (@guildId, @ticketId, @ticketCode, @actorId, @targetId, @eventType, @oldValue, @newValue, @createdAt)`
    ).run({
      guildId: entry.guildId,
      ticketId: entry.ticketId ?? null,
      ticketCode: entry.ticketCode ?? null,
      actorId: entry.actorId ?? null,
      targetId: entry.targetId ?? null,
      eventType: entry.eventType,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("[audit] failed to record event:", entry.eventType, error);
  }
}

export function recordClaimHistory(
  ticketId: number,
  previousClaimant: string | null,
  newClaimant: string | null,
  actorId: string,
  action: ClaimAction
): void {
  db.prepare(
    `INSERT INTO claim_history (ticket_id, previous_claimant, new_claimant, actor_id, action, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ticketId, previousClaimant, newClaimant, actorId, action, Date.now());
}
