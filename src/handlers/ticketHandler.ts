import {
  AttachmentBuilder,
  ButtonInteraction,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalSubmitInteraction,
  OverwriteResolvable,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import { getLeads, getTicketType } from "../db/ticketConfigRepo";
import {
  claimTicket,
  closeTicket,
  createTicket,
  getTicketById,
  setMessageId,
} from "../db/ticketRepo";
import { buildChannelName, formatLeadsMention, resolveTemplate } from "../utils/ticketFormatter";
import {
  applyTicketStatus,
  buildCloseConfirmRow,
  buildTicketButtons,
  buildTicketEmbed,
  buildTranscriptLogEmbed,
} from "../utils/ticketEmbeds";
import { buildTicketDetailsModal } from "../utils/ticketModal";
import { canManageTicket } from "../utils/permissions";
import { generateTranscript } from "../utils/transcript";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_CANCEL_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
} from "./ticketConstants";

export {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_CANCEL_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
} from "./ticketConstants";

export async function handleTicketCreateModal(interaction: ModalSubmitInteraction) {
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  if (!guildId || !guild) return;

  const typeKey = interaction.customId.slice(TICKET_CREATE_MODAL_PREFIX.length + 1);
  const ticketType = getTicketType(guildId, typeKey);
  if (!ticketType) {
    await interaction.reply({
      content: "This ticket type is no longer configured. Please try again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const details = interaction.fields.getTextInputValue("details");
  const leads = getLeads(ticketType.id);

  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
    ...leads.map((leadId) => ({
      id: leadId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  const channel = await guild.channels.create({
    name: buildChannelName(ticketType.channelPrefix, interaction.user.username),
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
  });

  const ticket = createTicket(guildId, typeKey, interaction.user.id, channel.id);

  const openMessage = resolveTemplate(ticketType.openMessage, {
    department: ticketType.department,
    leads: formatLeadsMention(leads),
    creator: `<@${interaction.user.id}>`,
  });

  const embed = buildTicketEmbed(ticket, ticketType, details, interaction.user.tag);
  const row = buildTicketButtons(ticket.id, false, false);

  const pingLine = leads.length > 0 ? leads.map((id) => `<@${id}>`).join(" ") : null;

  const message = await channel.send({
    content: [pingLine, openMessage].filter(Boolean).join("\n"),
    embeds: [embed],
    components: [row],
  });
  setMessageId(ticket.id, message.id);

  if (ticketType.reviewChannelId) {
    const reviewChannel = await interaction.client.channels
      .fetch(ticketType.reviewChannelId)
      .catch(() => null);
    if (reviewChannel instanceof TextChannel) {
      await reviewChannel.send(
        `New **${ticketType.displayName}** ticket opened by <@${interaction.user.id}>: <#${channel.id}>`
      );
    }
  }

  await interaction.reply({
    content: `Your ticket has been created: <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleTicketPanelSelect(interaction: StringSelectMenuInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const typeKey = interaction.values[0];
  const ticketType = getTicketType(guildId, typeKey);
  if (!ticketType) {
    await interaction.reply({
      content: "This ticket type is no longer configured.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(buildTicketDetailsModal(ticketType));
}

export async function handleTicketClaim(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_CLAIM_PREFIX.length));
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.status !== "open") {
    await interaction.reply({
      content: `This ticket is already ${ticket.status}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ticketType = getTicketType(ticket.guildId, ticket.typeKey);
  if (!ticketType) {
    await interaction.reply({
      content: "This ticket type is no longer configured.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageTicket(interaction.user.id, interaction.memberPermissions, ticketType.id)) {
    await interaction.reply({
      content: "Only assigned leads (or a server admin) can claim this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const claimed = claimTicket(ticketId, interaction.user.id);
  if (!claimed) return;

  const baseEmbed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder();
  const embed = applyTicketStatus(baseEmbed, claimed);
  const row = buildTicketButtons(ticketId, true, false);

  await interaction.update({ embeds: [embed], components: [row] });

  const claimMessage = resolveTemplate(ticketType.claimMessage, {
    claimant: `<@${interaction.user.id}>`,
    department: ticketType.department,
  });
  await interaction.followUp({ content: claimMessage });
}

function canCloseTicket(
  interaction: ButtonInteraction,
  ticketConfigId: number,
  creatorId: string
): boolean {
  return (
    canManageTicket(interaction.user.id, interaction.memberPermissions, ticketConfigId) ||
    interaction.user.id === creatorId
  );
}

export async function handleTicketCloseRequest(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_CLOSE_PREFIX.length));
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.status === "closed") {
    await interaction.reply({ content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }

  const ticketType = getTicketType(ticket.guildId, ticket.typeKey);
  if (!ticketType) {
    await interaction.reply({
      content: "This ticket type is no longer configured.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canCloseTicket(interaction, ticketType.id, ticket.creatorId)) {
    await interaction.reply({
      content: "You don't have permission to close this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: "Are you sure you want to close this ticket? This can't be undone.",
    components: [buildCloseConfirmRow(ticketId)],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleTicketCloseCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: "Close cancelled.", components: [] });
}

export async function handleTicketCloseConfirm(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_CLOSE_CONFIRM_PREFIX.length));
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.update({ content: "Ticket not found.", components: [] });
    return;
  }
  if (ticket.status === "closed") {
    await interaction.update({ content: "This ticket is already closed.", components: [] });
    return;
  }

  const ticketType = getTicketType(ticket.guildId, ticket.typeKey);
  if (!ticketType) {
    await interaction.update({ content: "This ticket type is no longer configured.", components: [] });
    return;
  }

  if (!canCloseTicket(interaction, ticketType.id, ticket.creatorId)) {
    await interaction.update({
      content: "You don't have permission to close this ticket.",
      components: [],
    });
    return;
  }

  const channel = interaction.channel;
  if (!(channel instanceof TextChannel)) return;

  const transcriptText = await generateTranscript(channel);
  const closed = closeTicket(ticketId, interaction.user.id);
  if (!closed) return;

  if (ticketType.reviewChannelId) {
    const reviewChannel = await interaction.client.channels
      .fetch(ticketType.reviewChannelId)
      .catch(() => null);
    if (reviewChannel instanceof TextChannel) {
      const logEmbed = buildTranscriptLogEmbed(closed, ticketType, transcriptText);
      const attachment = new AttachmentBuilder(Buffer.from(transcriptText, "utf-8"), {
        name: `ticket-${ticketId}-transcript.txt`,
      });
      await reviewChannel.send({ embeds: [logEmbed], files: [attachment] });
    }
  }

  if (closed.messageId) {
    const originalMessage = await channel.messages.fetch(closed.messageId).catch(() => null);
    if (originalMessage) {
      const baseEmbed = originalMessage.embeds[0]
        ? EmbedBuilder.from(originalMessage.embeds[0])
        : new EmbedBuilder();
      const embed = applyTicketStatus(baseEmbed, closed);
      const row = buildTicketButtons(ticketId, true, true);
      await originalMessage.edit({ embeds: [embed], components: [row] }).catch(() => null);
    }
  }

  await interaction.update({
    content: "This ticket is now closed. The channel will be deleted in 5 seconds.",
    components: [],
  });

  setTimeout(() => {
    channel.delete().catch(() => null);
  }, 5000);
}
