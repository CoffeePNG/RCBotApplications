import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getAnswers } from "../db/answerRepo";
import { getLeads } from "../db/ticketConfigRepo";
import { buildTicketButtons, buildTicketEmbed } from "./ticketEmbeds";
import { formatLeadsMention, resolveTemplate } from "./ticketFormatter";
import { Ticket, TicketTypeConfig } from "../types/ticket";

/** Rebuilds a ticket's summary embed from stored data (answers + current status). */
export async function rebuildTicketEmbed(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig
): Promise<EmbedBuilder> {
  const creator = await client.users.fetch(ticket.creatorId).catch(() => null);
  const answers = getAnswers(ticket.id).map((a) => ({ label: a.questionLabel, answer: a.answer ?? "" }));
  const openMessage = resolveTemplate(ticketType.openMessage, {
    department: ticketType.department,
    leads: formatLeadsMention(getLeads(ticketType.id)),
    creator: `<@${ticket.creatorId}>`,
  });

  if (creator) return buildTicketEmbed(ticket, ticketType, answers, creator, openMessage);

  // Fallback if the creator can't be fetched (e.g. left Discord).
  const embed = new EmbedBuilder().setTitle(ticketType.displayName).setDescription(openMessage.slice(0, 2000));
  for (const { label, answer } of answers) {
    embed.addFields({ name: label.slice(0, 256), value: (answer.trim() || "*Not provided*").slice(0, 1024) });
  }
  embed.setFooter({ text: `${ticket.creatorId} • ${ticket.code ?? `#${ticket.id}`}` });
  return embed;
}

/** Re-renders a ticket's message (embed + buttons) to match its current DB state. */
export async function updateTicketMessage(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig
): Promise<void> {
  if (!ticket.channelId || !ticket.messageId) return;
  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return;
  const message = await channel.messages.fetch(ticket.messageId).catch(() => null);
  if (!message) return;

  const embed = await rebuildTicketEmbed(client, ticket, ticketType);
  await message
    .edit({ embeds: [embed], components: [buildTicketButtons(ticket)] })
    .catch(() => null);
}
