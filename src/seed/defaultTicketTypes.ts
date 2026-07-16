import { ensureTicketType } from "../db/ticketConfigRepo";

export interface TicketTypeSeed {
  typeKey: string;
  displayName: string;
  department: string;
  channelPrefix: string;
  openMessage: string;
  claimMessage: string;
  optionDescription: string;
}

const DEFAULT_OPEN_MESSAGE =
  "Thanks for opening a ticket! We've got it logged and a staff member will be with you as soon as possible. " +
  "If you have any extra details or screenshots that'd help us out, feel free to drop them here in the meantime.";

export const DEFAULT_TICKET_TYPES: TicketTypeSeed[] = [
  {
    typeKey: "application",
    displayName: "Staff Application",
    department: "leadership",
    channelPrefix: "application",
    openMessage: DEFAULT_OPEN_MESSAGE,
    claimMessage: "{claimant} has claimed this application and will be reviewing it.",
    optionDescription: "Apply to join the staff team.",
  },
  {
    typeKey: "bug_report",
    displayName: "Bug Report",
    department: "development",
    channelPrefix: "bug",
    openMessage: DEFAULT_OPEN_MESSAGE,
    claimMessage: "{claimant} has claimed this bug report and is looking into it.",
    optionDescription: "Report a bug or glitch you've run into.",
  },
  {
    typeKey: "appeal",
    displayName: "Appeal",
    department: "moderation",
    channelPrefix: "appeal",
    openMessage: DEFAULT_OPEN_MESSAGE,
    claimMessage: "{claimant} has claimed this appeal and will be reviewing it.",
    optionDescription: "Appeal a ban, mute, or other moderation action.",
  },
  {
    typeKey: "help_request",
    displayName: "Help Request",
    department: "support",
    channelPrefix: "help",
    openMessage: DEFAULT_OPEN_MESSAGE,
    claimMessage: "{claimant} has claimed this help request.",
    optionDescription: "Get help with anything else.",
  },
];

export function seedDefaultTicketTypes(guildId: string): void {
  for (const seed of DEFAULT_TICKET_TYPES) {
    ensureTicketType({ guildId, ...seed });
  }
}
