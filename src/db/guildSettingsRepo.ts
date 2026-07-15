import { db } from "./connect";
import { GuildSettings } from "../types/ticket";

export function getGuildSettings(guildId: string): GuildSettings {
  const row = db
    .prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`)
    .get(guildId) as any;
  return {
    guildId,
    modLogChannelId: row ? row.mod_log_channel_id : null,
    panelChannelId: row ? row.panel_channel_id : null,
    panelMessageId: row ? row.panel_message_id : null,
  };
}

export function setModLogChannel(guildId: string, channelId: string): void {
  db.prepare(
    `INSERT INTO guild_settings (guild_id, mod_log_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET mod_log_channel_id = excluded.mod_log_channel_id`
  ).run(guildId, channelId);
}

export function setPanelInfo(guildId: string, channelId: string, messageId: string): void {
  db.prepare(
    `INSERT INTO guild_settings (guild_id, panel_channel_id, panel_message_id)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET
       panel_channel_id = excluded.panel_channel_id,
       panel_message_id = excluded.panel_message_id`
  ).run(guildId, channelId, messageId);
}
