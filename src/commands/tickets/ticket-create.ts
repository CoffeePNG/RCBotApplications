import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { getTicketType } from "../../db/ticketConfigRepo";
import { TICKET_CREATE_MODAL_PREFIX } from "../../handlers/ticketHandler";
import { respondTicketTypeAutocomplete } from "../../utils/ticketTypeAutocomplete";
import { Command } from "../types";

export const ticketCreateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a ticket (application, bug report, appeal, or help request).")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Open a new ticket.")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("The kind of ticket to open")
            .setRequired(true)
            .setAutocomplete(true)
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

    const modal = new ModalBuilder()
      .setCustomId(`${TICKET_CREATE_MODAL_PREFIX}:${typeKey}`)
      .setTitle(ticketType.displayName.slice(0, 45));

    const details = new TextInputBuilder()
      .setCustomId("details")
      .setLabel("What's this about?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(details));

    await interaction.showModal(modal);
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondTicketTypeAutocomplete(interaction);
  },
};
