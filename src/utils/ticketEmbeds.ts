import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  User,
} from "discord.js";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_DELETE_CANCEL_PREFIX,
  TICKET_DELETE_CONFIRM_PREFIX,
  TICKET_DELETE_PREFIX,
  TICKET_OUTCOME_PREFIX,
  TICKET_REOPEN_PREFIX,
  TICKET_STAFFONLY_PREFIX,
  TICKET_TAKEOVER_PREFIX,
  TICKET_UNCLAIM_PREFIX,
} from "../handlers/ticketConstants";
import { CLOSE_OUTCOMES } from "./closeOutcomes";
import { Ticket } from "../types/ticket";
import { TicketTypeConfig } from "../types/ticket";
import { ParticipantCount } from "./transcript";

function statusColor(status: Ticket["status"]): number {
  if (status === "claimed") return 0xfee75c;
  if (status === "closed") return 0x99aab5;
  return 0x5865f2;
}

/** Sets an embed's color and adds Claimed/Closed fields to match a ticket's current status. */
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

/** Builds the embed posted on ticket creation: welcome text + each question and its answer. */
export function buildTicketEmbed(
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  answers: { label: string; answer: string }[],
  creator: User,
  openMessage: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(ticketType.displayName)
    .setDescription(openMessage.slice(0, 2000))
    .setFooter({
      text: `${creator.username} (${creator.id}) • ${ticket.code ?? `#${ticket.id}`}`,
      iconURL: creator.displayAvatarURL(),
    })
    .setTimestamp(ticket.createdAt);

  // One field per question. Discord caps a message at 25 fields; questions cap at 5.
  for (const { label, answer } of answers) {
    embed.addFields({
      name: label.slice(0, 256),
      value: (answer.trim() || "*Not provided*").slice(0, 1024),
    });
  }

  return applyTicketStatus(embed, ticket);
}

/**
 * The action buttons on a ticket's message, derived from its current status:
 * - open: [Claim, Close]
 * - claimed: [Unclaim, Take Over, Close]
 * - closed (archived, awaiting deletion): [Delete]
 * - deleted: [Delete (disabled)]
 */
export function buildTicketButtons(ticket: Ticket): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (ticket.status === "closed" || ticket.status === "deleted") {
    const done = ticket.status === "deleted";
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_REOPEN_PREFIX}${ticket.id}`)
        .setLabel("Reopen")
        .setStyle(ButtonStyle.Success)
        .setDisabled(done),
      new ButtonBuilder()
        .setCustomId(`${TICKET_STAFFONLY_PREFIX}${ticket.id}`)
        .setLabel("Make Staff Only")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(done),
      new ButtonBuilder()
        .setCustomId(`${TICKET_DELETE_PREFIX}${ticket.id}`)
        .setLabel("Delete Channel")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(done)
    );
    return row;
  }

  if (ticket.status === "open") {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_CLAIM_PREFIX}${ticket.id}`)
        .setLabel("Claim")
        .setStyle(ButtonStyle.Primary)
    );
  } else if (ticket.status === "claimed") {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_UNCLAIM_PREFIX}${ticket.id}`)
        .setLabel("Unclaim")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${TICKET_TAKEOVER_PREFIX}${ticket.id}`)
        .setLabel("Take Over")
        .setStyle(ButtonStyle.Primary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${TICKET_CLOSE_PREFIX}${ticket.id}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
  return row;
}

/** Confirm/Cancel buttons for the two-step channel delete (shown ephemerally). */
export function buildDeleteConfirmRow(ticketId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TICKET_DELETE_CONFIRM_PREFIX}${ticketId}`)
      .setLabel("Yes, delete it")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${TICKET_DELETE_CANCEL_PREFIX}${ticketId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

/** The outcome-picker buttons shown (ephemerally) after clicking Close. */
export function buildOutcomeButtons(ticketId: number): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  CLOSE_OUTCOMES.forEach((outcome, index) => {
    if (index % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
    rows[rows.length - 1].addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_OUTCOME_PREFIX}${ticketId}:${index}`)
        .setLabel(outcome)
        .setStyle(outcome === "Approved" ? ButtonStyle.Success : outcome === "Denied" ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
  });
  return rows;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** The archive-channel summary embed for a closed ticket: who was involved and a per-person message count, no transcript text. */
export function buildTranscriptLogEmbed(
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  participants: ParticipantCount[]
): EmbedBuilder {
  const participantSummary =
    participants.length > 0
      ? participants.map((p) => `${p.tag} — ${p.count} message${p.count === 1 ? "" : "s"}`).join("\n")
      : "*no messages*";

  const reference = ticket.code ?? `Ticket #${ticket.id}`;
  const embed = new EmbedBuilder()
    .setTitle(`${ticketType.displayName} — ${reference}`)
    .setColor(0x99aab5)
    .addFields(
      { name: "Opened by", value: `<@${ticket.creatorId}>`, inline: true },
      {
        name: "Claimed by",
        value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "*nobody*",
        inline: true,
      },
      {
        name: "Closed by",
        value: ticket.closedBy ? `<@${ticket.closedBy}>` : "*unknown*",
        inline: true,
      },
      { name: "Outcome", value: ticket.outcome ?? "*none*", inline: true },
      {
        name: "Duration",
        value: ticket.closedAt != null ? formatDuration(ticket.closedAt - ticket.createdAt) : "unknown",
        inline: true,
      }
    );

  if (ticket.closeReason) {
    embed.addFields({ name: "Reason", value: ticket.closeReason.slice(0, 1024) });
  }
  embed.addFields({ name: "Messages", value: participantSummary.slice(0, 1024) });
  return embed
    .setFooter({ text: `${ticketType.typeKey} • ${reference}` })
    .setTimestamp(ticket.closedAt ?? Date.now());
}
