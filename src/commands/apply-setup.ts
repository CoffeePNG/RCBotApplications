import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../db/database";
import { Command } from "./types";

export const applySetupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("apply-setup")
    .setDescription("Configure the staff application system for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("review-channel")
        .setDescription("Set the channel where new applications are posted for review.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The review channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("log-channel")
        .setDescription("Set the channel where decided applications are archived.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The archive/log channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("staff-role")
        .setDescription("Set the role allowed to approve or deny applications.")
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("The staff/reviewer role")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View the current application system configuration.")
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

    const sub = interaction.options.getSubcommand();

    if (sub === "review-channel") {
      const channel = interaction.options.getChannel("channel", true);
      updateGuildConfig(guildId, { reviewChannelId: channel.id });
      await interaction.reply({
        content: `Review channel set to <#${channel.id}>.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "log-channel") {
      const channel = interaction.options.getChannel("channel", true);
      updateGuildConfig(guildId, { logChannelId: channel.id });
      await interaction.reply({
        content: `Archive/log channel set to <#${channel.id}>.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "staff-role") {
      const role = interaction.options.getRole("role", true);
      updateGuildConfig(guildId, { staffRoleId: role.id });
      await interaction.reply({
        content: `Staff role set to <@&${role.id}>.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "view") {
      const cfg = getGuildConfig(guildId);
      await interaction.reply({
        content: [
          "**Application system configuration**",
          `Review channel: ${cfg.reviewChannelId ? `<#${cfg.reviewChannelId}>` : "not set"}`,
          `Archive/log channel: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "not set"}`,
          `Staff role: ${cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : "not set"}`,
        ].join("\n"),
        ephemeral: true,
      });
    }
  },
};
