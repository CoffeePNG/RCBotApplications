import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildSettings } from "../db/guildSettingsRepo";

export async function postModLog(
  client: Client,
  guildId: string,
  embed: EmbedBuilder
): Promise<void> {
  const settings = getGuildSettings(guildId);
  if (!settings.modLogChannelId) return;

  const channel = await client.channels.fetch(settings.modLogChannelId).catch(() => null);
  if (channel instanceof TextChannel) {
    await channel.send({ embeds: [embed] });
  }
}
