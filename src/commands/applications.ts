import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getApplicationsForUser } from "../db/database";
import { Command } from "./types";

const statusEmoji: Record<string, string> = {
  pending: "🕒",
  approved: "✅",
  denied: "❌",
};

export const applicationsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("applications")
    .setDescription("View a user's staff application history.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The user whose application history to view")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser("user", true);
    const history = getApplicationsForUser(guildId, user.id);

    if (history.length === 0) {
      await interaction.reply({
        content: `${user.tag} has no application history.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Application history: ${user.tag}`)
      .setColor(0x5865f2)
      .setDescription(
        history
          .slice(0, 10)
          .map((app) => {
            const date = new Date(app.submittedAt).toLocaleDateString();
            const emoji = statusEmoji[app.status] ?? "❔";
            return `${emoji} **#${app.id}** — ${app.status} — submitted ${date}`;
          })
          .join("\n")
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
