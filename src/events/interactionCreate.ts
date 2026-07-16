import { Interaction, MessageFlags } from "discord.js";
import { Command } from "../commands/types";
import {
  CONFIG_EDIT_MODAL_PREFIX,
  PANEL_EDIT_MODAL_ID,
  handleConfigEditModalSubmit,
  handlePanelEditModalSubmit,
} from "../handlers/configHandler";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_MODAL_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_PANEL_SELECT_ID,
  TICKET_TAKEOVER_PREFIX,
  TICKET_UNCLAIM_PREFIX,
} from "../handlers/ticketConstants";
import {
  handleTicketClaim,
  handleTicketCloseModalSubmit,
  handleTicketCloseRequest,
  handleTicketCreateModal,
  handleTicketPanelSelect,
  handleTicketTakeover,
  handleTicketUnclaim,
} from "../handlers/ticketHandler";
import {
  Q_ADD,
  Q_ADD_MODAL,
  Q_DOWN,
  Q_EDIT,
  Q_EDIT_MODAL,
  Q_REMOVE,
  Q_RESET,
  Q_SELECT,
  Q_UP,
  handleQuestionButton,
  handleQuestionModalSubmit,
  handleQuestionSelect,
} from "../handlers/questionAdminHandler";

const QUESTION_BUTTON_PREFIXES = [Q_ADD, Q_RESET, Q_EDIT, Q_REMOVE, Q_UP, Q_DOWN];

export async function handleInteraction(
  interaction: Interaction,
  commandsByName: Map<string, Command>
) {
  const startedAt = Date.now();
  try {
    if (interaction.isChatInputCommand()) {
      console.log(
        `[interaction] /${interaction.commandName} from ${interaction.user.tag} in guild ${interaction.guildId ?? "DM"}`
      );
      const command = commandsByName.get(interaction.commandName);
      if (!command) {
        console.warn(`[interaction] no handler registered for command "${interaction.commandName}"`);
        return;
      }
      await command.execute(interaction);
      console.log(`[interaction] /${interaction.commandName} handled in ${Date.now() - startedAt}ms`);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(TICKET_CLOSE_MODAL_PREFIX)) {
        await handleTicketCloseModalSubmit(interaction);
      } else if (interaction.customId.startsWith(TICKET_CREATE_MODAL_PREFIX)) {
        await handleTicketCreateModal(interaction);
      } else if (interaction.customId.startsWith(CONFIG_EDIT_MODAL_PREFIX)) {
        await handleConfigEditModalSubmit(interaction);
      } else if (interaction.customId === PANEL_EDIT_MODAL_ID) {
        await handlePanelEditModalSubmit(interaction);
      } else if (
        interaction.customId.startsWith(Q_ADD_MODAL) ||
        interaction.customId.startsWith(Q_EDIT_MODAL)
      ) {
        await handleQuestionModalSubmit(interaction);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === TICKET_PANEL_SELECT_ID) {
        await handleTicketPanelSelect(interaction);
      } else if (interaction.customId.startsWith(Q_SELECT)) {
        await handleQuestionSelect(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(TICKET_CLOSE_PREFIX)) {
        await handleTicketCloseRequest(interaction);
      } else if (interaction.customId.startsWith(TICKET_CLAIM_PREFIX)) {
        await handleTicketClaim(interaction);
      } else if (interaction.customId.startsWith(TICKET_UNCLAIM_PREFIX)) {
        await handleTicketUnclaim(interaction);
      } else if (interaction.customId.startsWith(TICKET_TAKEOVER_PREFIX)) {
        await handleTicketTakeover(interaction);
      } else if (QUESTION_BUTTON_PREFIXES.some((p) => interaction.customId.startsWith(p))) {
        await handleQuestionButton(interaction);
      }
      return;
    }
  } catch (error) {
    const label = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()
        ? interaction.customId
        : interaction.type;
    console.error(`[interaction] error handling ${label} after ${Date.now() - startedAt}ms:`, error);

    if (interaction.isRepliable()) {
      const content = "Something went wrong handling that action.";
      const respond =
        interaction.replied || interaction.deferred
          ? interaction.followUp({ content, flags: MessageFlags.Ephemeral })
          : interaction.reply({ content, flags: MessageFlags.Ephemeral });
      await respond.catch((replyError) =>
        console.error("[interaction] failed to send error notice:", replyError)
      );
    }
  }
}
