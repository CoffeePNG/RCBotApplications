import { db } from "./connect";
import { TicketTypeConfig } from "../types/ticket";

function rowToConfig(row: any): TicketTypeConfig {
  return {
    id: row.id,
    guildId: row.guild_id,
    typeKey: row.type_key,
    displayName: row.display_name,
    department: row.department,
    channelPrefix: row.channel_prefix,
    reviewChannelId: row.review_channel_id,
    openMessage: row.open_message,
    claimMessage: row.claim_message,
  };
}

export function getTicketTypes(guildId: string): TicketTypeConfig[] {
  const rows = db
    .prepare(`SELECT * FROM ticket_configs WHERE guild_id = ? ORDER BY id ASC`)
    .all(guildId) as any[];
  return rows.map(rowToConfig);
}

export function getTicketType(guildId: string, typeKey: string): TicketTypeConfig | null {
  const row = db
    .prepare(`SELECT * FROM ticket_configs WHERE guild_id = ? AND type_key = ?`)
    .get(guildId, typeKey) as any;
  return row ? rowToConfig(row) : null;
}

export function getTicketTypeById(id: number): TicketTypeConfig | null {
  const row = db.prepare(`SELECT * FROM ticket_configs WHERE id = ?`).get(id) as any;
  return row ? rowToConfig(row) : null;
}

export function ensureTicketType(
  seed: Omit<TicketTypeConfig, "id" | "reviewChannelId">
): TicketTypeConfig {
  const existing = getTicketType(seed.guildId, seed.typeKey);
  if (existing) return existing;

  const info = db
    .prepare(
      `INSERT INTO ticket_configs
         (guild_id, type_key, display_name, department, channel_prefix, open_message, claim_message)
       VALUES (@guildId, @typeKey, @displayName, @department, @channelPrefix, @openMessage, @claimMessage)`
    )
    .run(seed);
  return getTicketTypeById(info.lastInsertRowid as number)!;
}

export function setReviewChannel(
  guildId: string,
  typeKey: string,
  channelId: string
): boolean {
  const info = db
    .prepare(
      `UPDATE ticket_configs SET review_channel_id = ? WHERE guild_id = ? AND type_key = ?`
    )
    .run(channelId, guildId, typeKey);
  return info.changes > 0;
}

export function getLeads(ticketConfigId: number): string[] {
  const rows = db
    .prepare(`SELECT user_id FROM ticket_leads WHERE ticket_config_id = ?`)
    .all(ticketConfigId) as any[];
  return rows.map((r) => r.user_id);
}

export function isLead(ticketConfigId: number, userId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM ticket_leads WHERE ticket_config_id = ? AND user_id = ?`
    )
    .get(ticketConfigId, userId);
  return !!row;
}

export function addLead(ticketConfigId: number, userId: string): boolean {
  const already = isLead(ticketConfigId, userId);
  if (already) return false;
  db.prepare(
    `INSERT INTO ticket_leads (ticket_config_id, user_id) VALUES (?, ?)`
  ).run(ticketConfigId, userId);
  return true;
}

export function removeLead(ticketConfigId: number, userId: string): boolean {
  const info = db
    .prepare(
      `DELETE FROM ticket_leads WHERE ticket_config_id = ? AND user_id = ?`
    )
    .run(ticketConfigId, userId);
  return info.changes > 0;
}
