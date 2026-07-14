import {
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { getTicketType, setReviewChannel } from "../../db/ticketConfigRepo";
import { respondTicketTypeAutocomplete } from "../../utils/ticketTypeAutocomplete";
import { Command } from "../types";

export const ticketConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket-config")
    .setDescription("Configure per-ticket-type settings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("review-channel")
        .setDescription("Set the channel a ticket type's new-ticket notices and transcripts go to.")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("The ticket type to configure")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The review/archive channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "review-channel") {
      const typeKey = interaction.options.getString("type", true);
      const channel = interaction.options.getChannel("channel", true);

      const ticketType = getTicketType(guildId, typeKey);
      if (!ticketType) {
        await interaction.reply({
          content: "Unknown ticket type. Pick one from the autocomplete list.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      setReviewChannel(guildId, typeKey, channel.id);
      await interaction.reply({
        content: `Review/archive channel for **${ticketType.displayName}** set to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondTicketTypeAutocomplete(interaction);
  },
};
