import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { Ticket } from "../types/ticket";
import { TicketTypeConfig } from "../types/ticket";

function statusColor(status: Ticket["status"]): number {
  if (status === "claimed") return 0xfee75c;
  if (status === "closed") return 0x99aab5;
  return 0x5865f2;
}

export function buildTicketEmbed(
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  details: string,
  creatorTag: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(ticketType.displayName)
    .setColor(statusColor(ticket.status))
    .setDescription(details.slice(0, 4000))
    .addFields({ name: "Opened by", value: `${creatorTag} (<@${ticket.creatorId}>)` })
    .setFooter({ text: `Ticket #${ticket.id} • ${ticketType.department}` })
    .setTimestamp(ticket.createdAt);

  if (ticket.status === "claimed" && ticket.claimedBy) {
    embed.addFields({ name: "Claimed by", value: `<@${ticket.claimedBy}>` });
  }
  if (ticket.status === "closed") {
    embed.addFields({
      name: "Closed",
      value: ticket.closedBy ? `by <@${ticket.closedBy}>` : "closed",
    });
  }

  return embed;
}

export function applyTicketStatus(embed: EmbedBuilder, ticket: Ticket): EmbedBuilder {
  embed.setColor(statusColor(ticket.status));
  if (ticket.status === "claimed" && ticket.claimedBy) {
    embed.addFields({ name: "Claimed by", value: `<@${ticket.claimedBy}>` });
  }
  if (ticket.status === "closed") {
    embed.addFields({
      name: "Closed",
      value: ticket.closedBy ? `by <@${ticket.closedBy}>` : "closed",
    });
  }
  return embed;
}

export function buildTicketButtons(
  ticketId: number,
  claimDisabled: boolean,
  closeDisabled: boolean
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim:${ticketId}`)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimDisabled),
    new ButtonBuilder()
      .setCustomId(`ticket_close:${ticketId}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closeDisabled)
  );
}
