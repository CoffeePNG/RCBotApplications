import { ButtonInteraction, TextChannel } from "discord.js";
import {
  decideApplication,
  getApplication,
  getGuildConfig,
} from "../db/database";
import { buildApplicationEmbed, buildDecisionRow } from "./embeds";

const CUSTOM_ID_PATTERN = /^app_(approve|deny)_(\d+)$/;

function memberHasRole(member: ButtonInteraction["member"], roleId: string): boolean {
  if (!member) return false;
  const roles = member.roles;
  if (Array.isArray(roles)) return roles.includes(roleId);
  return roles.cache.has(roleId);
}

export async function handleButton(interaction: ButtonInteraction) {
  const match = CUSTOM_ID_PATTERN.exec(interaction.customId);
  if (!match) return;

  const [, action, idStr] = match;
  const applicationId = Number(idStr);
  const guildId = interaction.guildId;
  if (!guildId) return;

  const cfg = getGuildConfig(guildId);
  const hasStaffRole = cfg.staffRoleId
    ? memberHasRole(interaction.member, cfg.staffRoleId)
    : false;

  if (!hasStaffRole) {
    await interaction.reply({
      content: "You don't have permission to review applications.",
      ephemeral: true,
    });
    return;
  }

  const application = getApplication(applicationId);
  if (!application) {
    await interaction.reply({ content: "Application not found.", ephemeral: true });
    return;
  }

  if (application.status !== "pending") {
    await interaction.reply({
      content: `This application was already ${application.status}.`,
      ephemeral: true,
    });
    return;
  }

  const status = action === "approve" ? "approved" : "denied";
  const decided = decideApplication(applicationId, status, interaction.user.id);
  if (!decided) return;

  const applicant = await interaction.client.users.fetch(decided.userId).catch(() => null);
  const embed = applicant ? buildApplicationEmbed(decided, applicant) : null;
  const row = buildDecisionRow(applicationId, true);

  if (embed) {
    await interaction.update({ embeds: [embed], components: [row] });
  } else {
    await interaction.update({ components: [row] });
  }

  if (applicant) {
    await applicant
      .send(
        status === "approved"
          ? "Your staff application has been **approved**! Someone will follow up with next steps."
          : "Your staff application has been **denied**. You're welcome to apply again in the future."
      )
      .catch(() => null);
  }

  if (cfg.logChannelId && embed) {
    const logChannel = await interaction.client.channels
      .fetch(cfg.logChannelId)
      .catch(() => null);
    if (logChannel && logChannel instanceof TextChannel) {
      await logChannel.send({ embeds: [embed] });
    }
  }
}
