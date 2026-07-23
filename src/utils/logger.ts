import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildSettings } from "../db/guildSettingsRepo";
import { Ticket, TicketTypeConfig } from "../types/ticket";
import { TicketLifecycleEvent, buildTicketLogEmbed } from "./ticketEmbeds";

/** Posts an embed to the configured ticket-log channel, if one is set. */
async function postToLogChannel(client: Client, guildId: string, embed: EmbedBuilder): Promise<void> {
  const settings = getGuildSettings(guildId);
  if (!settings.ticketLogChannelId) return;

  const channel = await client.channels.fetch(settings.ticketLogChannelId).catch(() => null);
  if (channel instanceof TextChannel) {
    await channel.send({ embeds: [embed] });
  }
}

/**
 * Logs a ticket lifecycle event (close / reopen / delete) to the ticket-log
 * channel. One entry point for all three so the outcome and note are recorded
 * the same way everywhere — and survive even after the channel is deleted.
 */
export async function postTicketLog(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  event: TicketLifecycleEvent,
  actorId: string,
  details?: { outcome?: string | null; reason?: string | null }
): Promise<void> {
  await postToLogChannel(client, ticket.guildId, buildTicketLogEmbed(ticket, ticketType, event, actorId, details));
}
