import { db } from "./connect";
import { GuildSettings } from "../types/ticket";

export function getGuildSettings(guildId: string): GuildSettings {
  const row = db
    .prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`)
    .get(guildId) as any;
  return {
    guildId,
    modLogChannelId: row ? row.mod_log_channel_id : null,
  };
}

export function setModLogChannel(guildId: string, channelId: string): void {
  db.prepare(
    `INSERT INTO guild_settings (guild_id, mod_log_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET mod_log_channel_id = excluded.mod_log_channel_id`
  ).run(guildId, channelId);
}
