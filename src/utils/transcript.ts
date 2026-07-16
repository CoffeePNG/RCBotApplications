import { AttachmentBuilder, Message, TextChannel } from "discord.js";

interface TranscriptLine {
  timestamp: number;
  text: string;
}

export interface ParticipantCount {
  tag: string;
  count: number;
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

function describeAttachments(message: Message): string {
  if (message.attachments.size === 0) return "";
  const parts = message.attachments.map((a) => `${a.name ?? "attachment"} <${a.url}>`);
  return `\n    [attachments] ${parts.join(", ")}`;
}

function describeEmbeds(message: Message): string {
  if (message.embeds.length === 0) return "";
  return `\n    [${message.embeds.length} embed${message.embeds.length === 1 ? "" : "s"}]`;
}

function renderLine(message: Message): TranscriptLine {
  const time = new Date(message.createdTimestamp).toISOString();
  const author = `${message.author.tag} (${message.author.id})`;

  if (message.system) {
    return { timestamp: message.createdTimestamp, text: `[${time}] * system (type ${message.type}) — ${author}` };
  }

  const meta: string[] = [`msg ${message.id}`];
  if (message.reference?.messageId) meta.push(`reply→${message.reference.messageId}`);
  if (message.editedTimestamp) meta.push(`edited ${new Date(message.editedTimestamp).toISOString()}`);
  if (message.pinned) meta.push("pinned");

  const body = message.content.length > 0 ? message.content : "(no text)";
  const text =
    `[${time}] ${author} {${meta.join(", ")}}\n    ${body.replace(/\n/g, "\n    ")}` +
    describeAttachments(message) +
    describeEmbeds(message);

  return { timestamp: message.createdTimestamp, text };
}

export async function generateTranscript(channel: TextChannel, limit = 2000): Promise<Transcript> {
  const lines: TranscriptLine[] = [];
  const counts = new Map<string, number>();
  let before: string | undefined;
  let fetched = 0;

  while (fetched < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    let oldestId = before;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const message of batch.values()) {
      lines.push(renderLine(message));
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

  lines.sort((a, b) => a.timestamp - b.timestamp);

  const header = `Transcript for #${channel.name} (${channel.id})\nGenerated ${new Date().toISOString()}\nMessages: ${lines.length}\n${"=".repeat(60)}\n`;
  const participants = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    text: header + (lines.map((l) => l.text).join("\n\n") || "(no messages)"),
    participants,
    messageCount: lines.length,
  };
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
