import { TextChannel } from "discord.js";

interface TranscriptLine {
  timestamp: number;
  tag: string;
  content: string;
  attachments: string;
}

export interface ParticipantCount {
  tag: string;
  count: number;
}

export interface Transcript {
  text: string;
  participants: ParticipantCount[];
}

export async function generateTranscript(channel: TextChannel, limit = 500): Promise<Transcript> {
  const messages: TranscriptLine[] = [];
  const counts = new Map<string, number>();
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
      // Count human messages only, so the summary reflects who actually talked.
      if (!msg.author.bot) {
        counts.set(msg.author.tag, (counts.get(msg.author.tag) ?? 0) + 1);
      }
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

  const participants = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    text: lines.join("\n") || "(no messages)",
    participants,
  };
}
