import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { isLead } from "../db/ticketConfigRepo";

export function hasManageGuild(
  permissions: PermissionsBitField | Readonly<PermissionsBitField> | null | undefined
): boolean {
  return !!permissions?.has(PermissionFlagsBits.ManageGuild);
}

export function canManageTicket(
  userId: string,
  permissions: PermissionsBitField | Readonly<PermissionsBitField> | null | undefined,
  ticketConfigId: number
): boolean {
  if (hasManageGuild(permissions)) return true;
  return isLead(ticketConfigId, userId);
}
