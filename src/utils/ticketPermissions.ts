import { Client, TextChannel } from "discord.js";
import { getGuildSettings } from "../db/guildSettingsRepo";
import { getTicketType } from "../db/ticketConfigRepo";
import { getOpenTickets, getOpenTicketsByType } from "../db/ticketRepo";
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
  await channel.permissionOverwrites.edit(userId, VIEWER_ALLOW).catch(() => null);
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
