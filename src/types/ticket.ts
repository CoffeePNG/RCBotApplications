export interface TicketTypeConfig {
  id: number;
  guildId: string;
  typeKey: string;
  displayName: string;
  department: string;
  channelPrefix: string;
  reviewChannelId: string | null;
  openMessage: string;
  claimMessage: string;
  optionDescription: string | null;
  enabled: boolean;
}

export type TicketStatus = "open" | "claimed" | "closing" | "closing_failed" | "closed";

export interface Ticket {
  id: number;
  guildId: string;
  typeKey: string;
  creatorId: string;
  channelId: string;
  code: string | null;
  messageId: string | null;
  status: TicketStatus;
  claimedBy: string | null;
  createdAt: number;
  claimedAt: number | null;
  closedAt: number | null;
  closedBy: string | null;
  closeReason: string | null;
  outcome: string | null;
  archiveChannelId: string | null;
  archiveMessageId: string | null;
  archivedAt: number | null;
  archiveError: string | null;
}

export type QuestionStyle = "short" | "paragraph";

export interface TicketQuestion {
  id: number;
  guildId: string;
  typeKey: string;
  internalKey: string;
  position: number;
  label: string;
  placeholder: string | null;
  inputStyle: QuestionStyle;
  required: boolean;
  enabled: boolean;
}

export interface TicketAnswer {
  id: number;
  ticketId: number;
  questionInternalKey: string | null;
  questionLabel: string;
  questionPosition: number;
  answer: string | null;
}

export type ClaimAction = "claim" | "unclaim" | "takeover" | "assign";

export interface Participant {
  ticketId: number;
  userId: string;
  addedBy: string;
  addedAt: number;
  active: boolean;
}

export interface Warning {
  id: number;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: number;
  active: boolean;
}

export interface GuildSettings {
  guildId: string;
  modLogChannelId: string | null;
  panelChannelId: string | null;
  panelMessageId: string | null;
  panelTitle: string | null;
  panelDescription: string | null;
  ticketCategoryId: string | null;
  archiveChannelId: string | null;
}
