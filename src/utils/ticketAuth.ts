import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { isLead, isLeadOfAnyType } from "../db/ticketConfigRepo";
import { isActiveParticipant } from "../db/participantRepo";
import { isManagerAssigned } from "../db/managerRepo";
import { countActiveTicketsByCreator } from "../db/ticketRepo";
import { Ticket, TicketTypeConfig } from "../types/ticket";

type Perms = PermissionsBitField | Readonly<PermissionsBitField> | null | undefined;

/** Max simultaneously-open tickets a non-staff member may have. Staff are exempt. */
export const MAX_OPEN_TICKETS_PER_USER = 3;

/** The message shown when a non-staff member hits the open-ticket cap. */
export const TICKET_CAP_MESSAGE = `You can only have ${MAX_OPEN_TICKETS_PER_USER} open tickets at a time. Please wait for one to be resolved before opening another.`;

/** Discord admin override — Manage Server or Administrator, checked live from current perms. */
export function hasAdminOverride(permissions: Perms): boolean {
  return (
    !!permissions?.has(PermissionFlagsBits.ManageGuild) ||
    !!permissions?.has(PermissionFlagsBits.Administrator)
  );
}

/**
 * Full management access: an explicitly assigned Ticket Manager, or a Discord
 * admin override (Manage Server / Administrator). Ticket Managers are stored by
 * user ID in the ticket_managers table.
 */
export function isManager(guildId: string, userId: string, permissions: Perms): boolean {
  return hasAdminOverride(permissions) || isManagerAssigned(guildId, userId);
}

export function isTypeStaff(ticketConfigId: number, userId: string): boolean {
  return isLead(ticketConfigId, userId);
}

/** "Staff" for cap purposes: an admin, a Ticket Manager, or a lead of any ticket type. */
export function isStaffMember(guildId: string, userId: string, permissions: Perms): boolean {
  return hasAdminOverride(permissions) || isManagerAssigned(guildId, userId) || isLeadOfAnyType(guildId, userId);
}

/** Whether a user may open another ticket: staff are exempt; everyone else is capped. */
export function canOpenNewTicket(guildId: string, userId: string, permissions: Perms): boolean {
  if (isStaffMember(guildId, userId, permissions)) return true;
  return countActiveTicketsByCreator(guildId, userId) < MAX_OPEN_TICKETS_PER_USER;
}

export function isCreator(ticket: Ticket, userId: string): boolean {
  return ticket.creatorId === userId;
}

export function isClaimant(ticket: Ticket, userId: string): boolean {
  return ticket.claimedBy === userId;
}

export function isParticipant(ticketId: number, userId: string): boolean {
  return isActiveParticipant(ticketId, userId);
}

interface Ctx {
  userId: string;
  permissions: Perms;
  ticket: Ticket;
  ticketType: TicketTypeConfig;
}

function manages(ctx: Ctx): boolean {
  return isManager(ctx.ticket.guildId, ctx.userId, ctx.permissions);
}

/** Claim / take over: assigned staff for the type, or a manager. */
export function canClaim(ctx: Ctx): boolean {
  return manages(ctx) || isTypeStaff(ctx.ticketType.id, ctx.userId);
}

/** Unclaim: the current claimant or a manager. */
export function canUnclaim(ctx: Ctx): boolean {
  return manages(ctx) || isClaimant(ctx.ticket, ctx.userId);
}

/** Assign to a specific staff member: managers, or the claimant (target still validated separately). */
export function canAssign(ctx: Ctx): boolean {
  return manages(ctx) || isClaimant(ctx.ticket, ctx.userId);
}

/** Close / delete / transcript: assigned staff, the current claimant, or a manager — NOT the creator. */
export function canClose(ctx: Ctx): boolean {
  return (
    manages(ctx) ||
    isTypeStaff(ctx.ticketType.id, ctx.userId) ||
    isClaimant(ctx.ticket, ctx.userId)
  );
}

/** Add/remove participants: claimant, assigned staff, or a manager. */
export function canManageParticipants(ctx: Ctx): boolean {
  return manages(ctx) || isTypeStaff(ctx.ticketType.id, ctx.userId) || isClaimant(ctx.ticket, ctx.userId);
}

/**
 * Does the user still have a bot-managed reason to keep a permission overwrite on
 * a ticket channel (used when removing staff/manager access)? Deliberately excludes
 * Discord admin override, which grants access independently of overwrites.
 */
export function hasResidualTicketAccess(
  ticket: Ticket,
  ticketType: TicketTypeConfig,
  userId: string
): boolean {
  return (
    isCreator(ticket, userId) ||
    isClaimant(ticket, userId) ||
    isTypeStaff(ticketType.id, userId) ||
    isManagerAssigned(ticket.guildId, userId) ||
    isActiveParticipant(ticket.id, userId)
  );
}
