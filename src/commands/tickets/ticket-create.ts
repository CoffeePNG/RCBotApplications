import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { getTicketType } from "../../db/ticketConfigRepo";
import { getTicketByChannel } from "../../db/ticketRepo";
import { addParticipant, removeParticipant } from "../../db/participantRepo";
import { recordAudit } from "../../db/auditRepo";
import { respondTicketTypeAutocomplete } from "../../utils/ticketTypeAutocomplete";
import { buildTicketDetailsModal } from "../../utils/ticketModal";
import { grantChannelAccess, revokeChannelAccess } from "../../utils/ticketPermissions";
import { canManageParticipants, hasResidualTicketAccess } from "../../utils/ticketAuth";
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a user to this ticket (grants them channel access).")
        .addUserOption((opt) => opt.setName("user").setDescription("The user to add").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a participant you previously added to this ticket.")
        .addUserOption((opt) => opt.setName("user").setDescription("The user to remove").setRequired(true))
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
    if (sub === "create") return handleCreate(interaction, guildId);
    return handleParticipant(interaction, guildId, sub);
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondTicketTypeAutocomplete(interaction, true);
  },
};

async function handleCreate(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const typeKey = interaction.options.getString("type", true);
  const ticketType = getTicketType(guildId, typeKey);
  if (!ticketType) {
    await interaction.reply({
      content: "Unknown ticket type. Pick one from the autocomplete list.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!ticketType.enabled) {
    await interaction.reply({
      content: `**${ticketType.displayName}** tickets are currently closed.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = buildTicketDetailsModal(ticketType);
  if (!modal) {
    await interaction.reply({
      content: `**${ticketType.displayName}** isn't ready yet — no questions are configured. Please contact an admin.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.showModal(modal);
}

async function handleParticipant(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  sub: string
): Promise<void> {
  const channel = interaction.channel;
  const ticket = channel ? getTicketByChannel(channel.id) : null;
  if (!ticket) {
    await interaction.reply({
      content: "Run this inside a ticket channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (ticket.status === "closed" || ticket.status === "closing") {
    await interaction.reply({
      content: "This ticket is closed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const ticketType = getTicketType(guildId, ticket.typeKey);
  if (!ticketType) {
    await interaction.reply({ content: "This ticket's type no longer exists.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canManageParticipants({ userId: interaction.user.id, permissions: interaction.memberPermissions, ticket, ticketType })) {
    await interaction.reply({
      content: "You don't have permission to manage participants on this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = interaction.options.getUser("user", true);
  const textChannel = channel instanceof TextChannel ? channel : null;

  if (sub === "add") {
    const added = addParticipant(ticket.id, user.id, interaction.user.id);
    if (added) {
      if (textChannel) await grantChannelAccess(textChannel, user.id);
      recordAudit({
        guildId,
        ticketId: ticket.id,
        ticketCode: ticket.code ?? undefined,
        actorId: interaction.user.id,
        targetId: user.id,
        eventType: "participant_added",
      });
      if (textChannel) await textChannel.send(`<@${interaction.user.id}> added <@${user.id}> to this ticket.`).catch(() => null);
    }
    await interaction.reply({
      content: added ? `Added ${user.tag} to this ticket.` : `${user.tag} is already a participant.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // remove
  const removed = removeParticipant(ticket.id, user.id);
  if (removed) {
    // Only strip the overwrite if nothing else (creator/claimant/staff/manager) keeps them in.
    if (textChannel && !hasResidualTicketAccess(ticket, ticketType, user.id)) {
      await revokeChannelAccess(textChannel, user.id);
    }
    recordAudit({
      guildId,
      ticketId: ticket.id,
      ticketCode: ticket.code ?? undefined,
      actorId: interaction.user.id,
      targetId: user.id,
      eventType: "participant_removed",
    });
    if (textChannel) await textChannel.send(`<@${interaction.user.id}> removed <@${user.id}> from this ticket.`).catch(() => null);
  }
  await interaction.reply({
    content: removed ? `Removed ${user.tag} from this ticket.` : `${user.tag} isn't a participant you can remove.`,
    flags: MessageFlags.Ephemeral,
  });
}
