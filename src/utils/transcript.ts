import { TextChannel } from "discord.js";

interface TranscriptLine {
  timestamp: number;
  tag: string;
  content: string;
  attachments: string;
}

export async function generateTranscript(channel: TextChannel, limit = 500): Promise<string> {
  const messages: TranscriptLine[] = [];
  let before: string | undefined;

  while (messages.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    let oldestId = before;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const msg of batch.values()) {
      messages.push({
        timestamp: msg.createdTimestamp,
        tag: msg.author.tag,
        content: msg.content,
        attachments: msg.attachments.map((a) => a.url).join(" "),
      });
      if (msg.createdTimestamp < oldestTimestamp) {
        oldestTimestamp = msg.createdTimestamp;
        oldestId = msg.id;
      }
    }
    before = oldestId;
    if (batch.size < 100) break;
  }

  messages.sort((a, b) => a.timestamp - b.timestamp);
  const lines = messages.map(
    (m) =>
      `[${new Date(m.timestamp).toISOString()}] ${m.tag}: ${m.content}${
        m.attachments ? ` ${m.attachments}` : ""
      }`
  );
  return lines.join("\n") || "(no messages)";
}
