import { Client } from "discord.js";
import { getActiveTicketsClaimedBy, getOpenTickets } from "../db/ticketRepo";
import { getTicketType } from "../db/ticketConfigRepo";
import { recordAudit } from "../db/auditRepo";
import { applyClaimChange } from "./claimActions";

/**
 * Frees up any tickets a user was holding when they lose their standing to hold
 * them (left the guild). Unclaims each active ticket they claimed so it's picked
 * up again by another staff member. Best-effort per ticket.
 */
export async function releaseClaimsForDepartedMember(
  client: Client,
  guildId: string,
  userId: string
): Promise<number> {
  const actorId = client.user?.id ?? userId;
  let released = 0;
  for (const ticket of getActiveTicketsClaimedBy(guildId, userId)) {
    const ticketType = getTicketType(guildId, ticket.typeKey);
    if (!ticketType) continue;
    const updated = await applyClaimChange(client, ticket, ticketType, null, actorId, "unclaim").catch(() => null);
    if (updated) released++;
  }
  if (released > 0) {
    recordAudit({
      guildId,
      actorId,
      targetId: userId,
      eventType: "staff_left_guild",
      newValue: String(released),
    });
  }
  return released;
}

/**
 * On startup, unclaim any ticket whose claimant is no longer in the server (e.g.
 * they left while the bot was offline, so no GuildMemberRemove fired). Conservative
 * by design: only members who are genuinely gone are released.
 */
export async function reconcileClaimsOnStartup(client: Client, guildId: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const actorId = client.user?.id ?? guildId;

  for (const ticket of getOpenTickets(guildId)) {
    if (ticket.status !== "claimed" || !ticket.claimedBy) continue;
    const member = await guild.members.fetch(ticket.claimedBy).catch(() => null);
    if (member) continue; // still here — leave the claim in place

    const ticketType = getTicketType(guildId, ticket.typeKey);
    if (!ticketType) continue;
    const updated = await applyClaimChange(client, ticket, ticketType, null, actorId, "unclaim").catch(() => null);
    if (updated) {
      recordAudit({
        guildId,
        ticketId: ticket.id,
        ticketCode: ticket.code ?? undefined,
        actorId,
        targetId: ticket.claimedBy,
        eventType: "staff_left_guild",
        oldValue: ticket.claimedBy,
      });
    }
  }
}
