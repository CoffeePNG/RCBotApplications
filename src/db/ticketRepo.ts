import { db } from "./connect";
import { Ticket, TicketStatus } from "../types/ticket";

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
  };
}

/** Builds a `<prefix>-<yyyymmdd>-<5 letters>` code that isn't already used by another ticket. */
function generateUniqueCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const codeExists = db.prepare(`SELECT 1 FROM tickets WHERE code = ?`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const letters = Array.from({ length: 5 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join("");
    const code = `${prefix}-${date}-${letters}`;
    if (!codeExists.get(code)) return code;
  }
  // Fall back to a timestamp suffix in the astronomically unlikely event of repeated collisions.
  return `${prefix}-${date}-${Date.now().toString(36)}`;
}

export function createTicket(
  guildId: string,
  typeKey: string,
  creatorId: string,
  codePrefix: string
): Ticket {
  const code = generateUniqueCode(codePrefix);
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

export function claimTicket(id: number, userId: string): Ticket | null {
  db.prepare(
    `UPDATE tickets SET status = 'claimed', claimed_by = ?, claimed_at = ? WHERE id = ?`
  ).run(userId, Date.now(), id);
  return getTicketById(id);
}

export function closeTicket(id: number, userId: string): Ticket | null {
  db.prepare(
    `UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ?`
  ).run(userId, Date.now(), id);
  return getTicketById(id);
}

export function getCounts(
  guildId: string,
  typeKey: string
): Record<TicketStatus, number> {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM tickets WHERE guild_id = ? AND type_key = ? GROUP BY status`
    )
    .all(guildId, typeKey) as any[];
  const counts: Record<TicketStatus, number> = { open: 0, claimed: 0, closed: 0 };
  for (const row of rows) {
    counts[row.status as TicketStatus] = row.count;
  }
  return counts;
}
