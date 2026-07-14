import { Interaction } from "discord.js";
import { Command } from "../commands/types";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  handleTicketClaim,
  handleTicketClose,
  handleTicketCreateModal,
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

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(TICKET_CLAIM_PREFIX)) {
        await handleTicketClaim(interaction);
      } else if (interaction.customId.startsWith(TICKET_CLOSE_PREFIX)) {
        await handleTicketClose(interaction);
      }
      return;
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    if (
      (interaction.isRepliable() && !interaction.replied && !interaction.deferred)
    ) {
      await interaction
        .reply({ content: "Something went wrong handling that action.", ephemeral: true })
        .catch(() => null);
    }
  }
}
