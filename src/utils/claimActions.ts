import { Client, TextChannel } from "discord.js";
import { recordAudit, recordClaimHistory } from "../db/auditRepo";
import { setClaim } from "../db/ticketRepo";
import { updateTicketMessage } from "./ticketMessage";
import { ClaimAction, Ticket, TicketTypeConfig } from "../types/ticket";

function noticeFor(action: ClaimAction, actorId: string, newClaimant: string | null): string {
  switch (action) {
    case "unclaim":
      return `<@${actorId}> unclaimed this ticket. It's available for another staff member.`;
    case "takeover":
      return `<@${actorId}> has taken over this ticket.`;
    case "assign":
      return `<@${actorId}> assigned this ticket to <@${newClaimant}>.`;
    case "claim":
    default:
      return `<@${newClaimant}> claimed this ticket.`;
  }
}

/**
 * Applies a claim ownership change: updates the DB, records claim history + audit,
 * re-renders the ticket message, and posts a visible channel notice.
 */
export async function applyClaimChange(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  newClaimant: string | null,
  actorId: string,
  action: ClaimAction
): Promise<Ticket | null> {
  const updated = setClaim(ticket.id, newClaimant);
  if (!updated) return null;

  recordClaimHistory(ticket.id, ticket.claimedBy, newClaimant, actorId, action);
  recordAudit({
    guildId: updated.guildId,
    ticketId: updated.id,
    ticketCode: updated.code,
    actorId,
    targetId: newClaimant ?? undefined,
    eventType: action,
    oldValue: ticket.claimedBy ?? undefined,
    newValue: newClaimant ?? undefined,
  });

  await updateTicketMessage(client, updated, ticketType);

  if (updated.channelId) {
    const channel = await client.channels.fetch(updated.channelId).catch(() => null);
    if (channel instanceof TextChannel) {
      await channel.send(noticeFor(action, actorId, newClaimant)).catch(() => null);
    }
  }

  return updated;
}
