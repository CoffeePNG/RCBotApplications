import {
  AutocompleteInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { getTicketType, setEnabled, setReviewChannel } from "../../db/ticketConfigRepo";
import { setArchiveCategory, setArchiveChannel, setTicketCategory } from "../../db/guildSettingsRepo";
import { buildConfigEditModal, ConfigField } from "../../handlers/configHandler";
import { buildQuestionsPanel } from "../../handlers/questionAdminHandler";
import { respondTicketTypeAutocomplete } from "../../utils/ticketTypeAutocomplete";
import { Command } from "../types";

const TYPE_OPTION_DESCRIPTION = "The ticket type to configure";

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
          opt.setName("type").setDescription(TYPE_OPTION_DESCRIPTION).setRequired(true).setAutocomplete(true)
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
        .setDescription("Edit the message posted when a ticket of this type opens.")
        .addStringOption((opt) =>
          opt.setName("type").setDescription(TYPE_OPTION_DESCRIPTION).setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("claim-message")
        .setDescription("Edit the message posted when a ticket of this type is claimed.")
        .addStringOption((opt) =>
          opt.setName("type").setDescription(TYPE_OPTION_DESCRIPTION).setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("option-description")
        .setDescription("Edit the blurb shown under this type in the ticket panel dropdown.")
        .addStringOption((opt) =>
          opt.setName("type").setDescription(TYPE_OPTION_DESCRIPTION).setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("category")
        .setDescription("Set the category all new ticket channels are created under (applies to every type).")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("The category channel")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("archive-channel")
        .setDescription("Set one shared channel that closed-ticket transcripts are archived to (all types).")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The shared archive channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("archive-category")
        .setDescription("Set the category that closed ticket channels are moved to before deletion.")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("The archive category")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("enabled")
        .setDescription("Open or close a ticket type (closed types can't be opened and hide from the panel).")
        .addStringOption((opt) =>
          opt.setName("type").setDescription(TYPE_OPTION_DESCRIPTION).setRequired(true).setAutocomplete(true)
        )
        .addBooleanOption((opt) =>
          opt.setName("open").setDescription("True to open this type, false to close it").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("questions")
        .setDescription("Manage the questions asked when a ticket of this type is opened.")
        .addStringOption((opt) =>
          opt.setName("type").setDescription(TYPE_OPTION_DESCRIPTION).setRequired(true).setAutocomplete(true)
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

    // `category` is a guild-wide setting, so it has no `type` option.
    if (sub === "category") {
      const category = interaction.options.getChannel("category", true);
      setTicketCategory(guildId, category.id);
      await interaction.reply({
        content: `New tickets will now open under the **${category.name}** category.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // `archive-channel` is also a guild-wide setting (shared across all types).
    if (sub === "archive-channel") {
      const channel = interaction.options.getChannel("channel", true);
      setArchiveChannel(guildId, channel.id);
      await interaction.reply({
        content: `Closed-ticket transcripts will now be archived to <#${channel.id}> for all ticket types.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // `archive-category` (guild-wide): where closed ticket channels are parked.
    if (sub === "archive-category") {
      const category = interaction.options.getChannel("category", true);
      setArchiveCategory(guildId, category.id);
      await interaction.reply({
        content: `Closed ticket channels will now be moved to the **${category.name}** category (staff-only) until deleted.`,
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

    if (sub === "review-channel") {
      const channel = interaction.options.getChannel("channel", true);
      setReviewChannel(guildId, typeKey, channel.id);
      await interaction.reply({
        content: `Review/archive channel for **${ticketType.displayName}** set to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "enabled") {
      const open = interaction.options.getBoolean("open", true);
      setEnabled(guildId, typeKey, open);
      await interaction.reply({
        content: `**${ticketType.displayName}** tickets are now ${open ? "open" : "closed"}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "questions") {
      await interaction.reply({
        ...buildQuestionsPanel(guildId, typeKey),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // open-message, claim-message, and option-description all edit multi-line/long text,
    // so they're edited via a pre-filled modal rather than a slash-command option.
    const fieldBySubcommand: Record<string, ConfigField> = {
      "open-message": "open",
      "claim-message": "claim",
      "option-description": "optdesc",
    };
    const field = fieldBySubcommand[sub];
    if (field) {
      await interaction.showModal(buildConfigEditModal(field, ticketType));
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondTicketTypeAutocomplete(interaction);
  },
};
