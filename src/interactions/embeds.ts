import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  User,
} from "discord.js";
import { Application } from "../db/database";

export function buildApplicationEmbed(application: Application, applicant: User): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("New Staff Application")
    .setColor(statusColor(application.status))
    .setAuthor({
      name: applicant.tag,
      iconURL: applicant.displayAvatarURL(),
    })
    .setFooter({ text: `Application #${application.id} • ${applicant.id}` })
    .setTimestamp(application.submittedAt);

  for (const { question, answer } of application.answers) {
    embed.addFields({
      name: question,
      value: answer.length > 0 ? answer.slice(0, 1024) : "*(no answer)*",
    });
  }

  if (application.status !== "pending") {
    embed.addFields({
      name: "Decision",
      value: `${application.status === "approved" ? "✅ Approved" : "❌ Denied"}${
        application.decidedBy ? ` by <@${application.decidedBy}>` : ""
      }`,
    });
  }

  return embed;
}

function statusColor(status: Application["status"]): number {
  if (status === "approved") return 0x57f287;
  if (status === "denied") return 0xed4245;
  return 0x5865f2;
}

export function buildDecisionRow(
  applicationId: number,
  disabled: boolean
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_approve_${applicationId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`app_deny_${applicationId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}
