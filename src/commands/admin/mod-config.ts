import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { setModLogChannel } from "../../db/guildSettingsRepo";
import { Command } from "../types";

export const modConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("mod-config")
    .setDescription("Configure moderation settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("log-channel")
        .setDescription("Set the channel moderation actions are logged to.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The mod-log channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
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
    if (sub === "log-channel") {
      const channel = interaction.options.getChannel("channel", true);
      setModLogChannel(guildId, channel.id);
      await interaction.reply({
        content: `Mod-log channel set to <#${channel.id}>.`,
        ephemeral: true,
      });
    }
  },
};
