import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { isLead } from "../db/ticketConfigRepo";
import { isActiveParticipant } from "../db/participantRepo";
import { Ticket, TicketTypeConfig } from "../types/ticket";

type Perms = PermissionsBitField | Readonly<PermissionsBitField> | null | undefined;

/**
 * Centralized ticket authorization. "Global ticket manager" is currently mapped
 * to the Manage Server permission (the existing admin override). If a separate
 * configurable manager list is ever wanted, this is the single place to change.
 */
export function isManager(permissions: Perms): boolean {
  return !!permissions?.has(PermissionFlagsBits.ManageGuild);
}

export function isTypeStaff(ticketConfigId: number, userId: string): boolean {
  return isLead(ticketConfigId, userId);
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

/** Claim / take over: assigned staff for the type, or a manager. */
export function canClaim(ctx: Ctx): boolean {
  return isManager(ctx.permissions) || isTypeStaff(ctx.ticketType.id, ctx.userId);
}

/** Unclaim: the current claimant or a manager. */
export function canUnclaim(ctx: Ctx): boolean {
  return isManager(ctx.permissions) || isClaimant(ctx.ticket, ctx.userId);
}

/** Assign to a specific staff member: managers, or the claimant (target still validated separately). */
export function canAssign(ctx: Ctx): boolean {
  return isManager(ctx.permissions) || isClaimant(ctx.ticket, ctx.userId);
}

/** Close: creator, current claimant, assigned staff, or a manager. */
export function canClose(ctx: Ctx): boolean {
  return (
    isManager(ctx.permissions) ||
    isTypeStaff(ctx.ticketType.id, ctx.userId) ||
    isClaimant(ctx.ticket, ctx.userId) ||
    isCreator(ctx.ticket, ctx.userId)
  );
}

/** Add/remove participants: claimant, assigned staff, or a manager. */
export function canManageParticipants(ctx: Ctx): boolean {
  return (
    isManager(ctx.permissions) ||
    isTypeStaff(ctx.ticketType.id, ctx.userId) ||
    isClaimant(ctx.ticket, ctx.userId)
  );
}
