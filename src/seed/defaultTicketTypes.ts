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

export const DEFAULT_TICKET_TYPES: TicketTypeSeed[] = [
  {
    typeKey: "application",
    displayName: "Staff Application",
    department: "leadership",
    channelPrefix: "application",
    openMessage: "Thanks for applying! A member of the team will be with you shortly.",
    claimMessage: "{claimant} has claimed this application and will be reviewing it.",
    optionDescription: "Apply to join the staff team.",
  },
  {
    typeKey: "bug_report",
    displayName: "Bug Report",
    department: "development",
    channelPrefix: "bug",
    openMessage:
      "Thanks for the report! A member of the team will be with you shortly. Please include steps to reproduce, plus any screenshots or logs.",
    claimMessage: "{claimant} has claimed this bug report and is looking into it.",
    optionDescription: "Report a bug or glitch you've run into.",
  },
  {
    typeKey: "appeal",
    displayName: "Appeal",
    department: "moderation",
    channelPrefix: "appeal",
    openMessage:
      "Thanks — a member of the team will review your appeal shortly. Please explain what you're appealing and why.",
    claimMessage: "{claimant} has claimed this appeal and will be reviewing it.",
    optionDescription: "Appeal a ban, mute, or other moderation action.",
  },
  {
    typeKey: "help_request",
    displayName: "Help Request",
    department: "support",
    channelPrefix: "help",
    openMessage:
      "Thanks for reaching out! A member of the team will be with you shortly. Describe what you need help with.",
    claimMessage: "{claimant} has claimed this help request.",
    optionDescription: "Get help with anything else.",
  },
];

export function seedDefaultTicketTypes(guildId: string): void {
  for (const seed of DEFAULT_TICKET_TYPES) {
    ensureTicketType({ guildId, ...seed });
  }
}
