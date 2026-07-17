import { Command } from "./types";
import { ticketCreateCommand } from "./tickets/ticket-create";
import { transcriptCommand } from "./tickets/transcript";
import { staffStatusCommand } from "./admin/staff-status";
import { staffCommand } from "./admin/staff";
import { ticketConfigCommand } from "./admin/ticket-config";
import { ticketPanelCommand } from "./admin/ticket-panel";

export const commands: Command[] = [
  ticketCreateCommand,
  transcriptCommand,
  staffStatusCommand,
  staffCommand,
  ticketConfigCommand,
  ticketPanelCommand,
];
