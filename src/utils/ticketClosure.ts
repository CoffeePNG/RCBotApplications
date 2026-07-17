import { Client, TextChannel } from "discord.js";
import { getTicketById, markArchived } from "../db/ticketRepo";
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

/**
 * Captures a ticket channel's transcript and posts it (summary embed + .txt
 * file(s)) to the resolved archive channel, verifying the post landed. Used both
 * by the Delete step and the manual `/transcript` command. Records the archive
 * message id on success. Does NOT delete the channel — the caller decides that.
 */
export async function postTranscript(
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
      return { ok: false, noTarget: true, error: "No archive channel is configured." };
    }

    const archiveChannel = await client.channels.fetch(archiveChannelId).catch(() => null);
    if (!(archiveChannel instanceof TextChannel)) {
      const error = "Archive channel is missing or not a text channel.";
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
