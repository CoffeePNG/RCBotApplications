import { AttachmentBuilder, Message, TextChannel } from "discord.js";

export interface ParticipantCount {
  tag: string;
  count: number;
}

/** A person as shown in a transcript: display name, Discord tag, and id. */
export interface TranscriptIdentity {
  display: string;
  tag: string;
  id: string;
}

/** The ticket context needed to write the transcript header + questions section. */
export interface TranscriptContext {
  guildId: string;
  guildName: string;
  typeName: string;
  number: number;
  createdAt: number;
  createdBy: TranscriptIdentity | null;
  closedAt: number | null;
  closedBy: TranscriptIdentity | null;
  closeReason: string | null;
  claimedBy: TranscriptIdentity | null;
  questions: { label: string; answer: string }[];
}

export interface Transcript {
  /** The full plain-text transcript (safe to write to a file). */
  text: string;
  /** Human message counts, most-active first. */
  participants: ParticipantCount[];
  /** Total messages captured (humans + bots + system). */
  messageCount: number;
}

/** Neutralizes pings so transcript text pasted into a message can never notify anyone. */
export function sanitizeMentions(text: string): string {
  return text
    .replace(/@(everyone|here)/g, "@​$1")
    .replace(/<@(!?\d+)>/g, "<@​$1>")
    .replace(/<@&(\d+)>/g, "<@&​$1>");
}

/** "Tuesday, 14 July 2026 at 23:15:44 UTC" — used for the header dates. */
function formatHeaderDate(ms: number): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).formatToParts(new Date(ms));
  const get = (type: string) => p.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} at ${get("hour")}:${get("minute")}:${get("second")} UTC`;
}

/** "14/07/2026, 23:48:31 UTC" — used on each message line. */
function formatMessageDate(ms: number): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).formatToParts(new Date(ms));
  const get = (type: string) => p.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}, ${get("hour")}:${get("minute")}:${get("second")} UTC`;
}

/** `"display" @tag`, optionally with the id appended (for the participant list). */
function formatIdentity(identity: TranscriptIdentity | null, withId = false): string {
  if (!identity) return "(unknown)";
  const base = `"${identity.display}" @${identity.tag}`;
  return withId ? `${base} (${identity.id})` : base;
}

/** Prefixes every line of an answer with "> " so multi-line answers stay quoted. */
function quote(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "> (no answer)";
  return trimmed
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/** The identity to show for a message's author, preferring the server nickname. */
function authorIdentity(message: Message): TranscriptIdentity {
  const display = message.member?.displayName ?? message.author.displayName;
  return { display, tag: message.author.tag, id: message.author.id };
}

/** Renders a single message into its numbered transcript line(s). */
function renderMessage(message: Message, index: number, numberById: Map<string, number>): string {
  const time = formatMessageDate(message.createdTimestamp);
  const who = authorIdentity(message).display;

  if (message.system) {
    return `<${index}> [${time}] * system event (type ${message.type}) — ${who}`;
  }

  const suffixes: string[] = [];
  const replyNumber = message.reference?.messageId
    ? numberById.get(message.reference.messageId)
    : undefined;
  if (replyNumber) suffixes.push(`reply to <${replyNumber}>`);
  if (message.editedTimestamp) suffixes.push("edited");
  const suffix = suffixes.length > 0 ? ` (${suffixes.join(", ")})` : "";

  const body = message.content.length > 0 ? message.content.replace(/\n/g, "\n    ") : "(no text)";
  let line = `<${index}> [${time}] ${who}: ${body}${suffix}`;

  if (message.attachments.size > 0) {
    const parts = message.attachments.map((a) => `${a.name ?? "attachment"} <${a.url}>`);
    line += `\n    [attachments] ${parts.join(", ")}`;
  }
  if (message.embeds.length > 0) {
    line += `\n    [${message.embeds.length} embed${message.embeds.length === 1 ? "" : "s"}]`;
  }
  return line;
}

/**
 * Reads a ticket channel's messages and renders the full transcript document in
 * the Vindex-style format: a metadata header, the original questions/answers,
 * then the numbered message log.
 */
export async function generateTranscript(
  channel: TextChannel,
  ctx: TranscriptContext,
  limit = 2000
): Promise<Transcript> {
  const messages: Message[] = [];
  const counts = new Map<string, number>();
  let before: string | undefined;
  let fetched = 0;

  while (fetched < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    let oldestId = before;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const message of batch.values()) {
      messages.push(message);
      fetched++;
      // Count human, non-system messages so the summary reflects who actually talked.
      if (!message.author.bot && !message.system) {
        counts.set(message.author.tag, (counts.get(message.author.tag) ?? 0) + 1);
      }
      if (message.createdTimestamp < oldestTimestamp) {
        oldestTimestamp = message.createdTimestamp;
        oldestId = message.id;
      }
    }
    before = oldestId;
    if (batch.size < 100) break;
  }

  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Number every message first so replies can reference an earlier line's number.
  const numberById = new Map<string, number>();
  messages.forEach((message, i) => numberById.set(message.id, i + 1));

  // Everyone who appears in the channel, in first-seen order, plus the ticket's
  // creator / claimant / closer even if they never posted.
  const participants = new Map<string, TranscriptIdentity>();
  for (const message of messages) {
    if (!participants.has(message.author.id)) {
      participants.set(message.author.id, authorIdentity(message));
    }
  }
  for (const identity of [ctx.createdBy, ctx.claimedBy, ctx.closedBy]) {
    if (identity && !participants.has(identity.id)) participants.set(identity.id, identity);
  }

  const pinned = messages.filter((m) => m.pinned);
  const rendered = messages.map((m, i) => renderMessage(m, i + 1, numberById));

  const topic = ctx.questions.find((q) => q.answer.trim())?.answer.trim().slice(0, 500) || "(no topic)";

  const header = [
    `* ID: ${ctx.guildId} (${ctx.guildName})`,
    `* Number: ${ctx.typeName} Ticket #${ctx.number}`,
    `* Topic: ${topic}`,
    `* Created on: ${formatHeaderDate(ctx.createdAt)}`,
    `* Created by: ${formatIdentity(ctx.createdBy)}`,
    `* Closed on: ${ctx.closedAt != null ? formatHeaderDate(ctx.closedAt) : "(not closed)"}`,
    `* Closed by: ${ctx.closedBy ? formatIdentity(ctx.closedBy) : "(not closed)"}`,
    `* Closed because: ${ctx.closeReason?.trim() || "(no reason)"}`,
    `* Claimed by: ${ctx.claimedBy ? formatIdentity(ctx.claimedBy) : "(not claimed)"}`,
    participants.size > 0
      ? `* Participants:\n${[...participants.values()].map((p) => `  * ${formatIdentity(p, true)}`).join("\n")}`
      : "* Participants: (none)",
    pinned.length > 0
      ? `* Pinned messages:\n${pinned.map((m) => `  * <${numberById.get(m.id)}>`).join("\n")}`
      : "* Pinned messages: (none)",
  ].join("\n");

  const questionsSection =
    ctx.questions.length > 0
      ? ctx.questions.map((q) => `### **${q.label}**\n${quote(q.answer)}`).join("\n\n")
      : "*(none)*";

  const messagesSection = rendered.length > 0 ? rendered.join("\n") : "*(no messages)*";

  const text = `${header}\n\n---\n\n## Questions\n\n${questionsSection}\n\n## Messages\n\n${messagesSection}\n`;

  const participantCounts = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return { text, participants: participantCounts, messageCount: messages.length };
}

// Discord's default upload limit is 8 MB; stay well under it and split if needed.
const MAX_FILE_BYTES = 7_000_000;

/**
 * Turns a transcript into one or more `.txt` attachments, splitting on line
 * boundaries if the text would exceed Discord's upload limit.
 */
export function buildTranscriptFiles(text: string, baseName: string): AttachmentBuilder[] {
  const full = Buffer.from(text, "utf-8");
  if (full.byteLength <= MAX_FILE_BYTES) {
    return [new AttachmentBuilder(full, { name: `${baseName}.txt` })];
  }

  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (Buffer.byteLength(candidate, "utf-8") > MAX_FILE_BYTES && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks.map(
    (chunk, i) => new AttachmentBuilder(Buffer.from(chunk, "utf-8"), { name: `${baseName}-part${i + 1}.txt` })
  );
}
