import { Command } from "./types";
import { ticketCreateCommand } from "./tickets/ticket-create";
import { staffStatusCommand } from "./admin/staff-status";
import { staffCommand } from "./admin/staff";
import { ticketConfigCommand } from "./admin/ticket-config";
import { ticketPanelCommand } from "./admin/ticket-panel";
import { modConfigCommand } from "./admin/mod-config";
import { banCommand } from "./moderation/ban";
import { kickCommand } from "./moderation/kick";
import { timeoutCommand } from "./moderation/timeout";
import { warnCommand } from "./moderation/warn";
import { unwarnCommand } from "./moderation/unwarn";
import { warningsCommand } from "./moderation/warnings";

export const commands: Command[] = [
  ticketCreateCommand,
  staffStatusCommand,
  staffCommand,
  ticketConfigCommand,
  ticketPanelCommand,
  modConfigCommand,
  banCommand,
  kickCommand,
  timeoutCommand,
  warnCommand,
  unwarnCommand,
  warningsCommand,
];
