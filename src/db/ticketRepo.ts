import { db } from "./connect";
import { Ticket, TicketStatus } from "../types/ticket";
import { slugify } from "../utils/ticketFormatter";

function rowToTicket(row: any): Ticket {
  return {
    id: row.id,
    guildId: row.guild_id,
    typeKey: row.type_key,
    creatorId: row.creator_id,
    channelId: row.channel_id,
    code: row.code,
    messageId: row.message_id,
    status: row.status,
    claimedBy: row.claimed_by,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    closeReason: row.close_reason ?? null,
    outcome: row.outcome ?? null,
    archiveChannelId: row.archive_channel_id ?? null,
    archiveMessageId: row.archive_message_id ?? null,
    archivedAt: row.archived_at ?? null,
    archiveError: row.archive_error ?? null,
  };
}

/** Builds a `<prefix>-<username>-<5 digits>` code that isn't already used by another ticket. */
function generateUniqueCode(prefix: string, username: string): string {
  const namePart = slugify(username);
  const codeExists = db.prepare(`SELECT 1 FROM tickets WHERE code = ?`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const digits = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0");
    const code = `${prefix}-${namePart}-${digits}`;
    if (!codeExists.get(code)) return code;
  }
  // Fall back to a longer number in the astronomically unlikely event of repeated collisions.
  return `${prefix}-${namePart}-${Date.now().toString().slice(-8)}`;
}

export function createTicket(
  guildId: string,
  typeKey: string,
  creatorId: string,
  codePrefix: string,
  username: string
): Ticket {
  const code = generateUniqueCode(codePrefix, username);
  const info = db
    .prepare(
      `INSERT INTO tickets (guild_id, type_key, creator_id, channel_id, code, status, created_at)
       VALUES (?, ?, ?, '', ?, 'open', ?)`
    )
    .run(guildId, typeKey, creatorId, code, Date.now());
  return getTicketById(info.lastInsertRowid as number)!;
}

export function getTicketById(id: number): Ticket | null {
  const row = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as any;
  return row ? rowToTicket(row) : null;
}

export function getTicketByChannel(channelId: string): Ticket | null {
  const row = db
    .prepare(`SELECT * FROM tickets WHERE channel_id = ?`)
    .get(channelId) as any;
  return row ? rowToTicket(row) : null;
}

export function setMessageId(id: number, messageId: string): void {
  db.prepare(`UPDATE tickets SET message_id = ? WHERE id = ?`).run(messageId, id);
}

export function setChannelId(id: number, channelId: string): void {
  db.prepare(`UPDATE tickets SET channel_id = ? WHERE id = ?`).run(channelId, id);
}

/**
 * Atomically claims an unclaimed ticket. Returns the claimed ticket, or null if
 * someone else already holds it (guards against two simultaneous Claim clicks).
 */
export function claimTicket(id: number, userId: string): Ticket | null {
  const claim = db.transaction((): Ticket | null => {
    const info = db
      .prepare(
        `UPDATE tickets SET status = 'claimed', claimed_by = ?, claimed_at = ?
         WHERE id = ? AND status = 'open' AND claimed_by IS NULL`
      )
      .run(userId, Date.now(), id);
    return info.changes > 0 ? getTicketById(id) : null;
  });
  return claim();
}

/** Directly sets the claimant (takeover/assign). Pass null to unclaim (reverts to 'open'). */
export function setClaim(id: number, userId: string | null): Ticket | null {
  if (userId) {
    db.prepare(
      `UPDATE tickets SET status = 'claimed', claimed_by = ?, claimed_at = ? WHERE id = ?`
    ).run(userId, Date.now(), id);
  } else {
    db.prepare(
      `UPDATE tickets SET status = 'open', claimed_by = NULL, claimed_at = NULL
       WHERE id = ? AND status = 'claimed'`
    ).run(id);
  }
  return getTicketById(id);
}

/** Marks a ticket 'closing' with its reason/outcome (channel not yet deleted). */
export function markClosing(
  id: number,
  userId: string,
  reason: string | null,
  outcome: string | null
): Ticket | null {
  db.prepare(
    `UPDATE tickets SET status = 'closing', closed_by = ?, closed_at = ?, close_reason = ?, outcome = ?
     WHERE id = ?`
  ).run(userId, Date.now(), reason, outcome, id);
  return getTicketById(id);
}

export function markArchived(id: number, channelId: string, messageId: string): Ticket | null {
  db.prepare(
    `UPDATE tickets SET archive_channel_id = ?, archive_message_id = ?, archived_at = ?, archive_error = NULL
     WHERE id = ?`
  ).run(channelId, messageId, Date.now(), id);
  return getTicketById(id);
}

export function markArchiveFailed(id: number, error: string): Ticket | null {
  db.prepare(
    `UPDATE tickets SET status = 'closing_failed', archive_error = ? WHERE id = ?`
  ).run(error, id);
  return getTicketById(id);
}

export function markClosed(id: number): Ticket | null {
  db.prepare(`UPDATE tickets SET status = 'closed' WHERE id = ?`).run(id);
  return getTicketById(id);
}

/** Legacy one-shot close (kept until the structured close flow replaces the caller). */
export function closeTicket(id: number, userId: string): Ticket | null {
  db.prepare(
    `UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ?`
  ).run(userId, Date.now(), id);
  return getTicketById(id);
}

export function getOpenTicketsByType(guildId: string, typeKey: string): Ticket[] {
  const rows = db
    .prepare(
      `SELECT * FROM tickets WHERE guild_id = ? AND type_key = ? AND status IN ('open','claimed')`
    )
    .all(guildId, typeKey) as any[];
  return rows.map(rowToTicket);
}

export function getOpenTickets(guildId: string): Ticket[] {
  const rows = db
    .prepare(`SELECT * FROM tickets WHERE guild_id = ? AND status IN ('open','claimed')`)
    .all(guildId) as any[];
  return rows.map(rowToTicket);
}

export function getActiveTicketsClaimedBy(guildId: string, userId: string): Ticket[] {
  const rows = db
    .prepare(
      `SELECT * FROM tickets WHERE guild_id = ? AND claimed_by = ? AND status = 'claimed'`
    )
    .all(guildId, userId) as any[];
  return rows.map(rowToTicket);
}

export function getRecoverableTickets(): Ticket[] {
  const rows = db
    .prepare(`SELECT * FROM tickets WHERE status IN ('closing','closing_failed')`)
    .all() as any[];
  return rows.map(rowToTicket);
}

export function getCounts(guildId: string, typeKey: string): Record<TicketStatus, number> {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM tickets WHERE guild_id = ? AND type_key = ? GROUP BY status`
    )
    .all(guildId, typeKey) as any[];
  const counts: Record<TicketStatus, number> = {
    open: 0,
    claimed: 0,
    closing: 0,
    closing_failed: 0,
    closed: 0,
  };
  for (const row of rows) {
    counts[row.status as TicketStatus] = row.count;
  }
  return counts;
}
