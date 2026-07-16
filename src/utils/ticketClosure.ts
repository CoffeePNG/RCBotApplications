import { Client, TextChannel } from "discord.js";
import { getTicketById, markArchiveFailed, markArchived } from "../db/ticketRepo";
import { recordAudit } from "../db/auditRepo";
import { resolveArchiveChannelId } from "./ticketPermissions";
import { buildTranscriptLogEmbed } from "./ticketEmbeds";
import { buildTranscriptFiles, generateTranscript } from "./transcript";
import { Ticket, TicketTypeConfig } from "../types/ticket";

export interface ArchiveResult {
  ok: boolean;
  /** Present on failure — a short human-readable reason. */
  error?: string;
  /** True when there was no archive target configured, so nothing was posted. */
  noTarget?: boolean;
}

/** Freezes further messages in a closing ticket channel (best-effort). */
export async function lockTicketChannel(channel: TextChannel, creatorId: string): Promise<void> {
  await channel.permissionOverwrites
    .edit(channel.guild.roles.everyone, { SendMessages: false })
    .catch(() => null);
  await channel.permissionOverwrites.edit(creatorId, { SendMessages: false }).catch(() => null);
}

/**
 * Captures a ticket's transcript and posts it (summary embed + .txt file(s)) to the
 * resolved archive channel, verifying the post landed. Marks the ticket archived on
 * success or 'closing_failed' on error. NEVER deletes the channel — the caller does
 * that only after a confirmed archive, so a failure leaves the channel intact for retry.
 */
export async function archiveTicket(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  channel: TextChannel
): Promise<ArchiveResult> {
  const fresh = getTicketById(ticket.id) ?? ticket;
  const archiveChannelId = resolveArchiveChannelId(ticket.guildId, ticket.typeKey);

  try {
    const transcript = await generateTranscript(channel);

    if (!archiveChannelId) {
      // No archive channel configured for this type — record that and let the close
      // proceed (holding the channel open forever would be worse than no archive).
      markArchived(ticket.id, "", "");
      recordAudit({
        guildId: ticket.guildId,
        ticketId: ticket.id,
        ticketCode: fresh.code ?? undefined,
        eventType: "archive_succeeded",
        newValue: "no-target",
      });
      return { ok: true, noTarget: true };
    }

    const archiveChannel = await client.channels.fetch(archiveChannelId).catch(() => null);
    if (!(archiveChannel instanceof TextChannel)) {
      const error = `Archive channel is missing or not a text channel.`;
      markArchiveFailed(ticket.id, error);
      recordAudit({
        guildId: ticket.guildId,
        ticketId: ticket.id,
        ticketCode: fresh.code ?? undefined,
        eventType: "archive_failed",
        newValue: error,
      });
      return { ok: false, error };
    }

    const baseName = `${fresh.code ?? `ticket-${ticket.id}`}-transcript`;
    const files = buildTranscriptFiles(transcript.text, baseName);
    const posted = await archiveChannel.send({
      embeds: [buildTranscriptLogEmbed(fresh, ticketType, transcript.participants)],
      files,
    });

    // Verify: we only mark archived once we hold a real posted-message id.
    markArchived(ticket.id, archiveChannel.id, posted.id);
    recordAudit({
      guildId: ticket.guildId,
      ticketId: ticket.id,
      ticketCode: fresh.code ?? undefined,
      eventType: "archive_succeeded",
      newValue: posted.id,
    });
    return { ok: true };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 200);
    markArchiveFailed(ticket.id, message);
    recordAudit({
      guildId: ticket.guildId,
      ticketId: ticket.id,
      ticketCode: fresh.code ?? undefined,
      eventType: "archive_failed",
      newValue: message,
    });
    return { ok: false, error: message };
  }
}
