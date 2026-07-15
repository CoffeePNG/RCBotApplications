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
}

export type TicketStatus = "open" | "claimed" | "closed";

export interface Ticket {
  id: number;
  guildId: string;
  typeKey: string;
  creatorId: string;
  channelId: string;
  messageId: string | null;
  status: TicketStatus;
  claimedBy: string | null;
  createdAt: number;
  claimedAt: number | null;
  closedAt: number | null;
  closedBy: string | null;
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
}
