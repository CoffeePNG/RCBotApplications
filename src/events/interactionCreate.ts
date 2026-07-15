import { Interaction, MessageFlags } from "discord.js";
import { Command } from "../commands/types";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_CANCEL_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_PANEL_SELECT_ID,
} from "../handlers/ticketConstants";
import {
  handleTicketClaim,
  handleTicketCloseCancel,
  handleTicketCloseConfirm,
  handleTicketCloseRequest,
  handleTicketCreateModal,
  handleTicketPanelSelect,
} from "../handlers/ticketHandler";

export async function handleInteraction(
  interaction: Interaction,
  commandsByName: Map<string, Command>
) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(TICKET_CREATE_MODAL_PREFIX)) {
        await handleTicketCreateModal(interaction);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === TICKET_PANEL_SELECT_ID) {
        await handleTicketPanelSelect(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(TICKET_CLOSE_CONFIRM_PREFIX)) {
        await handleTicketCloseConfirm(interaction);
      } else if (interaction.customId.startsWith(TICKET_CLOSE_CANCEL_PREFIX)) {
        await handleTicketCloseCancel(interaction);
      } else if (interaction.customId.startsWith(TICKET_CLOSE_PREFIX)) {
        await handleTicketCloseRequest(interaction);
      } else if (interaction.customId.startsWith(TICKET_CLAIM_PREFIX)) {
        await handleTicketClaim(interaction);
      }
      return;
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Something went wrong handling that action.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
    }
  }
}
