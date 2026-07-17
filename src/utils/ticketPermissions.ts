import { Client, OverwriteType, TextChannel } from "discord.js";
import { getGuildSettings } from "../db/guildSettingsRepo";
import { getTicketType } from "../db/ticketConfigRepo";
import { getOpenTickets, getOpenTicketsByType } from "../db/ticketRepo";
import { getActiveParticipants } from "../db/participantRepo";
import { hasResidualTicketAccess } from "./ticketAuth";
import { Ticket } from "../types/ticket";

/** The permissions a staff member / manager / participant gets inside a ticket channel. */
const VIEWER_ALLOW = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AttachFiles: true,
  EmbedLinks: true,
} as const;

async function fetchTicketChannel(client: Client, ticket: Ticket): Promise<TextChannel | null> {
  if (!ticket.channelId) return null;
  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  return channel instanceof TextChannel ? channel : null;
}

export async function grantChannelAccess(channel: TextChannel, userId: string): Promise<void> {
  // `type: Member` avoids the "not a cached User or Role" resolution error for
  // users who aren't in the bot's cache.
  await channel.permissionOverwrites
    .edit(userId, VIEWER_ALLOW, { type: OverwriteType.Member })
    .catch(() => null);
}

export async function revokeChannelAccess(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.delete(userId).catch(() => null);
}

/** After adding type staff: give them access to every open ticket of that type. */
export async function syncStaffAdded(
  client: Client,
  guildId: string,
  typeKey: string,
  userId: string
): Promise<void> {
  for (const ticket of getOpenTicketsByType(guildId, typeKey)) {
    const channel = await fetchTicketChannel(client, ticket);
    if (channel) await grantChannelAccess(channel, userId);
  }
}

/** After removing type staff: drop access from that type's open tickets unless another source remains. */
export async function syncStaffRemoved(
  client: Client,
  guildId: string,
  typeKey: string,
  userId: string
): Promise<Ticket[]> {
  const ticketType = getTicketType(guildId, typeKey);
  if (!ticketType) return [];
  const affected: Ticket[] = [];
  for (const ticket of getOpenTicketsByType(guildId, typeKey)) {
    if (hasResidualTicketAccess(ticket, ticketType, userId)) continue;
    const channel = await fetchTicketChannel(client, ticket);
    if (channel) {
      await revokeChannelAccess(channel, userId);
      affected.push(ticket);
    }
  }
  return affected;
}

/** After assigning a manager: give them access to every open ticket in the guild. */
export async function syncManagerAdded(client: Client, guildId: string, userId: string): Promise<void> {
  for (const ticket of getOpenTickets(guildId)) {
    const channel = await fetchTicketChannel(client, ticket);
    if (channel) await grantChannelAccess(channel, userId);
  }
}

/** After removing a manager: drop access from open tickets unless another source remains. */
export async function syncManagerRemoved(
  client: Client,
  guildId: string,
  userId: string
): Promise<void> {
  for (const ticket of getOpenTickets(guildId)) {
    const ticketType = getTicketType(guildId, ticket.typeKey);
    if (ticketType && hasResidualTicketAccess(ticket, ticketType, userId)) continue;
    const channel = await fetchTicketChannel(client, ticket);
    if (channel) await revokeChannelAccess(channel, userId);
  }
}

/** The archive/review channel to post a closed ticket to: shared setting first, per-type fallback. */
export function resolveArchiveChannelId(guildId: string, typeKey: string): string | null {
  const shared = getGuildSettings(guildId).archiveChannelId;
  if (shared) return shared;
  return getTicketType(guildId, typeKey)?.reviewChannelId ?? null;
}

/**
 * Stage-1 close: parks a ticket channel in the configured archive category (if any)
 * and removes access for everyone but staff/managers — the creator and any added
 * participants lose their overwrites, so only the team can still see it.
 */
export async function archiveTicketChannel(channel: TextChannel, ticket: Ticket): Promise<void> {
  const categoryId = getGuildSettings(ticket.guildId).archiveCategoryId;
  if (categoryId) {
    await channel.setParent(categoryId, { lockPermissions: false }).catch(() => null);
  }

  // Drop the creator and every active participant; staff/manager overwrites remain.
  await revokeChannelAccess(channel, ticket.creatorId);
  for (const participant of getActiveParticipants(ticket.id)) {
    await revokeChannelAccess(channel, participant.userId);
  }
}

/**
 * Reopen: moves a channel back to the normal ticket category and restores access
 * for the creator and any active participants (staff/managers never lost access).
 */
export async function restoreTicketChannel(channel: TextChannel, ticket: Ticket): Promise<void> {
  const categoryId = getGuildSettings(ticket.guildId).ticketCategoryId;
  if (categoryId) {
    await channel.setParent(categoryId, { lockPermissions: false }).catch(() => null);
  }

  await grantChannelAccess(channel, ticket.creatorId);
  for (const participant of getActiveParticipants(ticket.id)) {
    await grantChannelAccess(channel, participant.userId);
  }
}
