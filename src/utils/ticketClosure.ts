import { AttachmentBuilder, Client, Guild, TextChannel } from "discord.js";
import { getTicketById, markArchived } from "../db/ticketRepo";
import { getAnswerPairs } from "../db/answerRepo";
import { recordAudit } from "../db/auditRepo";
import { resolveArchiveChannelId } from "./ticketPermissions";
import { buildTranscriptLogEmbed } from "./ticketEmbeds";
import {
  Transcript,
  TranscriptContext,
  TranscriptIdentity,
  buildTranscriptFiles,
  generateTranscript,
} from "./transcript";
import { Ticket, TicketTypeConfig } from "../types/ticket";

/** Resolves a user id to a transcript identity, preferring their server nickname. */
async function resolveIdentity(
  client: Client,
  guild: Guild,
  userId: string | null
): Promise<TranscriptIdentity | null> {
  if (!userId) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) return { display: member.displayName, tag: member.user.tag, id: userId };
  const user = await client.users.fetch(userId).catch(() => null);
  if (user) return { display: user.displayName, tag: user.tag, id: userId };
  return { display: "unknown", tag: userId, id: userId };
}

/** Assembles the header/questions context a transcript needs from a ticket. */
async function buildTranscriptContext(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  guild: Guild
): Promise<TranscriptContext> {
  const [createdBy, claimedBy, closedBy] = await Promise.all([
    resolveIdentity(client, guild, ticket.creatorId),
    resolveIdentity(client, guild, ticket.claimedBy),
    resolveIdentity(client, guild, ticket.closedBy),
  ]);
  return {
    guildId: guild.id,
    guildName: guild.name,
    typeName: ticketType.displayName,
    number: ticket.id,
    createdAt: ticket.createdAt,
    createdBy,
    closedAt: ticket.closedAt,
    closedBy,
    closeReason: ticket.closeReason,
    claimedBy,
    questions: getAnswerPairs(ticket.id),
  };
}

/**
 * Reads a ticket channel and renders its transcript once, returning both the
 * parsed transcript (participant counts, etc.) and the `.txt` attachment(s).
 * The single assembly point behind the archive post and the DM button.
 */
async function buildTicketTranscript(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  channel: TextChannel
): Promise<{ transcript: Transcript; files: AttachmentBuilder[] }> {
  const context = await buildTranscriptContext(client, ticket, ticketType, channel.guild);
  const transcript = await generateTranscript(channel, context);
  const baseName = `${ticket.code ?? `ticket-${ticket.id}`}-transcript`;
  return { transcript, files: buildTranscriptFiles(transcript.text, baseName) };
}

/**
 * The transcript `.txt` attachment(s) for a ticket. Used by the DM "Get
 * transcript" button; the caller passes an already-loaded ticket row.
 */
export async function generateTicketTranscriptFiles(
  client: Client,
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  channel: TextChannel
): Promise<AttachmentBuilder[]> {
  return (await buildTicketTranscript(client, ticket, ticketType, channel)).files;
}

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
    const { transcript, files } = await buildTicketTranscript(client, fresh, ticketType, channel);

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
