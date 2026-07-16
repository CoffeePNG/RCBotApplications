import { db } from "./connect";

/** Ticket Managers: an explicit global (all-type) management assignment by user ID. */
export function addManager(guildId: string, userId: string, addedBy: string): boolean {
  const existing = db
    .prepare(`SELECT 1 FROM ticket_managers WHERE guild_id = ? AND user_id = ?`)
    .get(guildId, userId);
  if (existing) return false;
  db.prepare(
    `INSERT INTO ticket_managers (guild_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)`
  ).run(guildId, userId, addedBy, Date.now());
  return true;
}

export function removeManager(guildId: string, userId: string): boolean {
  const info = db
    .prepare(`DELETE FROM ticket_managers WHERE guild_id = ? AND user_id = ?`)
    .run(guildId, userId);
  return info.changes > 0;
}

export function isManagerAssigned(guildId: string, userId: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM ticket_managers WHERE guild_id = ? AND user_id = ?`)
    .get(guildId, userId);
  return !!row;
}

export function getManagers(guildId: string): string[] {
  const rows = db
    .prepare(`SELECT user_id FROM ticket_managers WHERE guild_id = ? ORDER BY added_at ASC`)
    .all(guildId) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}
