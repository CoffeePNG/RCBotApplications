import {
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import {
  getTicketType,
  setClaimMessage,
  setOpenMessage,
  setReviewChannel,
} from "../../db/ticketConfigRepo";
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
          opt.setName("type").setDescription("The ticket type to configure").setRequired(true).setAutocomplete(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The review/archive channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("open-message")
        .setDescription("Set the message posted when a ticket of this type opens.")
        .addStringOption((opt) =>
          opt.setName("type").setDescription("The ticket type to configure").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Supports {department}, {leads}, {creator}")
            .setRequired(true)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("claim-message")
        .setDescription("Set the message posted when a ticket of this type is claimed.")
        .addStringOption((opt) =>
          opt.setName("type").setDescription("The ticket type to configure").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Supports {claimant}, {creator}, {department}")
            .setRequired(true)
            .setMaxLength(1000)
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

    const typeKey = interaction.options.getString("type", true);
    const ticketType = getTicketType(guildId, typeKey);
    if (!ticketType) {
      await interaction.reply({
        content: "Unknown ticket type. Pick one from the autocomplete list.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "review-channel") {
      const channel = interaction.options.getChannel("channel", true);
      setReviewChannel(guildId, typeKey, channel.id);
      await interaction.reply({
        content: `Review/archive channel for **${ticketType.displayName}** set to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "open-message") {
      const message = interaction.options.getString("message", true);
      setOpenMessage(guildId, typeKey, message);
      await interaction.reply({
        content: `Open message for **${ticketType.displayName}** updated. New tickets will use it right away.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "claim-message") {
      const message = interaction.options.getString("message", true);
      setClaimMessage(guildId, typeKey, message);
      await interaction.reply({
        content: `Claim message for **${ticketType.displayName}** updated.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondTicketTypeAutocomplete(interaction);
  },
};
