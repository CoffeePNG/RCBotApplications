import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildSettings } from "../db/guildSettingsRepo";
import { Ticket, TicketTypeConfig } from "../types/ticket";

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

/** Presentation for each ticket lifecycle event we log. */
const TICKET_EVENT_META = {
  closed: { title: "Ticket Closed", actorLabel: "Closed by", color: 0x99aab5 },
  reopened: { title: "Ticket Reopened", actorLabel: "Reopened by", color: 0x57f287 },
  deleted: { title: "Ticket Channel Deleted", actorLabel: "Deleted by", color: 0xed4245 },
} as const;

export type TicketLifecycleEvent = keyof typeof TICKET_EVENT_META;

/**
 * Logs a ticket lifecycle event (close / reopen / delete) to the mod-log channel.
 * One helper for all three so the close note and outcome are recorded the same way
 * everywhere — and survive even after the ticket channel itself is deleted.
 */
export async function postTicketLog(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  event: TicketLifecycleEvent,
  actorId: string,
  details?: { outcome?: string | null; reason?: string | null }
): Promise<void> {
  const meta = TICKET_EVENT_META[event];
  const reference = ticket.code ?? `#${ticket.id}`;

  const embed = new EmbedBuilder()
    .setTitle(meta.title)
    .setColor(meta.color)
    .addFields(
      { name: "Ticket", value: `${ticketType.displayName} — ${reference}`, inline: true },
      { name: meta.actorLabel, value: `<@${actorId}>`, inline: true },
      { name: "Opened by", value: `<@${ticket.creatorId}>`, inline: true }
    )
    .setTimestamp();

  if (details?.outcome) embed.addFields({ name: "Outcome", value: details.outcome, inline: true });
  if (details?.reason) embed.addFields({ name: "Note", value: details.reason.slice(0, 1024) });

  await postModLog(client, ticket.guildId, embed);
}
