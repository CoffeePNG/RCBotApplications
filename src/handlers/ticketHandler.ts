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
import { getGuildSettings } from "../db/guildSettingsRepo";
import { getManagers } from "../db/managerRepo";
import {
  claimTicket,
  closeTicket,
  createTicket,
  getTicketById,
  setChannelId,
  setMessageId,
} from "../db/ticketRepo";
import { getQuestions } from "../db/questionRepo";
import { saveAnswers } from "../db/answerRepo";
import { Ticket, TicketTypeConfig } from "../types/ticket";
import { formatLeadsMention, resolveTemplate } from "../utils/ticketFormatter";
import {
  applyTicketStatus,
  buildCloseConfirmRow,
  buildTicketButtons,
  buildTicketEmbed,
  buildTranscriptLogEmbed,
} from "../utils/ticketEmbeds";
import { buildTicketDetailsModal, questionFieldId } from "../utils/ticketModal";
import { canClaim, canClose, canUnclaim } from "../utils/ticketAuth";
import { recordAudit, recordClaimHistory } from "../db/auditRepo";
import { applyClaimChange } from "../utils/claimActions";
import { generateTranscript } from "../utils/transcript";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_CANCEL_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_TAKEOVER_PREFIX,
  TICKET_UNCLAIM_PREFIX,
} from "./ticketConstants";

export {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_CANCEL_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_TAKEOVER_PREFIX,
  TICKET_UNCLAIM_PREFIX,
} from "./ticketConstants";

/** Looks up a ticket and its type config from a button/modal customId's numeric suffix. */
function resolveTicketAndType(ticketId: number) {
  const ticket = getTicketById(ticketId);
  if (!ticket) return null;
  const ticketType = getTicketType(ticket.guildId, ticket.typeKey);
  if (!ticketType) return null;
  return { ticket, ticketType };
}

/** Builds the auth context (user + live perms + ticket + type) used by the ticketAuth helpers. */
function authCtx(interaction: ButtonInteraction, ticket: Ticket, ticketType: TicketTypeConfig) {
  return {
    userId: interaction.user.id,
    permissions: interaction.memberPermissions,
    ticket,
    ticketType,
  };
}

/** Modal submit for /ticket create and the panel select menu: creates the private channel and the ticket row. */
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
  if (!ticketType.enabled) {
    await interaction.reply({
      content: `**${ticketType.displayName}** tickets are currently closed.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Read each configured question's answer from the modal (safe if a question
  // was removed between the modal opening and submission).
  const questions = getQuestions(guildId, typeKey);
  const answerEntries = questions.map((question) => {
    let answer = "";
    try {
      answer = interaction.fields.getTextInputValue(questionFieldId(question)).trim();
    } catch {
      answer = "";
    }
    return { question, answer };
  });
  const leads = getLeads(ticketType.id);

  // Create the ticket row first so its unique code (used as the channel name) exists.
  const ticket = createTicket(
    guildId,
    typeKey,
    interaction.user.id,
    ticketType.channelPrefix,
    interaction.user.username
  );
  saveAnswers(ticket.id, answerEntries);
  const channelName = ticket.code ?? `ticket-${ticket.id}`;

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
    ...[...new Set([...leads, ...getManagers(guildId)])].map((viewerId) => ({
      id: viewerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    })),
  ];

  // Place the channel under the configured category if one is set; fall back to
  // no category if it's been deleted so ticket creation still succeeds.
  const categoryId = getGuildSettings(guildId).ticketCategoryId ?? undefined;
  const channel = await guild.channels
    .create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    })
    .catch(() =>
      guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
      })
    );
  setChannelId(ticket.id, channel.id);

  const openMessage = resolveTemplate(ticketType.openMessage, {
    department: ticketType.department,
    leads: formatLeadsMention(leads),
    creator: `<@${interaction.user.id}>`,
  });
  // Leads are pinged in the message body (embeds don't fire notifications); the
  // welcome text and the applicant's response live inside the embed itself.
  const pingLine = leads.length > 0 ? leads.map((id) => `<@${id}>`).join(" ") : undefined;

  const message = await channel.send({
    content: pingLine,
    embeds: [
      buildTicketEmbed(
        ticket,
        ticketType,
        answerEntries.map((e) => ({ label: e.question.label, answer: e.answer })),
        interaction.user,
        openMessage
      ),
    ],
    components: [buildTicketButtons(ticket)],
  });
  setMessageId(ticket.id, message.id);

  if (ticketType.reviewChannelId) {
    const reviewChannel = await interaction.client.channels
      .fetch(ticketType.reviewChannelId)
      .catch(() => null);
    if (reviewChannel instanceof TextChannel) {
      await reviewChannel.send(
        `New **${ticketType.displayName}** ticket \`${channelName}\` opened by <@${interaction.user.id}>: <#${channel.id}>`
      );
    }
  }

  await interaction.reply({
    content: `Your ticket has been created: <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

/** Ticket panel's select menu: same details modal as /ticket create, for whichever type was picked. */
export async function handleTicketPanelSelect(interaction: StringSelectMenuInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const ticketType = getTicketType(guildId, interaction.values[0]);
  if (!ticketType) {
    await interaction.reply({
      content: "This ticket type is no longer configured.",
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

/** Claim button: locks the ticket to one lead (or Manage Server holder) and pings the creator. */
export async function handleTicketClaim(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_CLAIM_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({
      content: "Ticket not found or its type is no longer configured.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status !== "open") {
    await interaction.reply({
      content: `This ticket is already ${ticket.status}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canClaim(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({
      content: "Only assigned staff, a Ticket Manager, or a server admin can claim this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const claimed = claimTicket(ticketId, interaction.user.id);
  if (!claimed) {
    await interaction.reply({
      content: "That ticket was just claimed by someone else.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  recordClaimHistory(ticketId, null, interaction.user.id, interaction.user.id, "claim");
  recordAudit({
    guildId: claimed.guildId,
    ticketId: claimed.id,
    ticketCode: claimed.code ?? undefined,
    actorId: interaction.user.id,
    targetId: interaction.user.id,
    eventType: "claim",
    newValue: interaction.user.id,
  });

  const baseEmbed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder();
  await interaction.update({
    embeds: [applyTicketStatus(baseEmbed, claimed)],
    components: [buildTicketButtons(claimed)],
  });

  const claimMessage = resolveTemplate(ticketType.claimMessage, {
    claimant: `<@${interaction.user.id}>`,
    department: ticketType.department,
    creator: `<@${claimed.creatorId}>`,
  });
  // Explicit creator ping so they get a notification even if the template omits {creator}.
  await interaction.followUp({ content: `<@${claimed.creatorId}> ${claimMessage}` });
}

/** Unclaim button: the current claimant (or a manager) releases the ticket back to open. */
export async function handleTicketUnclaim(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_UNCLAIM_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status !== "claimed") {
    await interaction.reply({ content: "This ticket isn't currently claimed.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canUnclaim(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({
      content: "Only the current claimant, a Ticket Manager, or a server admin can unclaim this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  await applyClaimChange(interaction.client, ticket, ticketType, null, interaction.user.id, "unclaim");
}

/** Take Over button: staff or a manager (not the current claimant) grabs a claimed ticket. */
export async function handleTicketTakeover(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_TAKEOVER_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status !== "claimed") {
    await interaction.reply({ content: "This ticket isn't currently claimed.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.claimedBy === interaction.user.id) {
    await interaction.reply({ content: "You already have this ticket claimed.", flags: MessageFlags.Ephemeral });
    return;
  }
  // Taking over requires the same standing as claiming (assigned staff or a manager).
  if (!canClaim(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({
      content: "Only assigned staff, a Ticket Manager, or a server admin can take over this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  await applyClaimChange(interaction.client, ticket, ticketType, interaction.user.id, interaction.user.id, "takeover");
}

/** Close button, step 1: asks for confirmation before anything happens. */
export async function handleTicketCloseRequest(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_CLOSE_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({
      content: "Ticket not found or its type is no longer configured.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status === "closed") {
    await interaction.reply({ content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!canClose(authCtx(interaction, ticket, ticketType))) {
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

/** Close confirmation, "Cancel": dismisses the ephemeral prompt, ticket stays open. */
export async function handleTicketCloseCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: "Close cancelled.", components: [] });
}

/** Close confirmation, "Confirm": archives the transcript, marks closed, deletes the channel. */
export async function handleTicketCloseConfirm(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_CLOSE_CONFIRM_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.update({ content: "Ticket not found or its type is no longer configured.", components: [] });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status === "closed") {
    await interaction.update({ content: "This ticket is already closed.", components: [] });
    return;
  }

  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.update({ content: "You don't have permission to close this ticket.", components: [] });
    return;
  }

  const channel = interaction.channel;
  if (!(channel instanceof TextChannel)) return;

  const transcript = await generateTranscript(channel);
  const closed = closeTicket(ticketId, interaction.user.id);
  if (!closed) return;

  if (ticketType.reviewChannelId) {
    const reviewChannel = await interaction.client.channels
      .fetch(ticketType.reviewChannelId)
      .catch(() => null);
    if (reviewChannel instanceof TextChannel) {
      // Summary embed first, then the transcript code block + full-text file underneath it.
      await reviewChannel.send({
        embeds: [buildTranscriptLogEmbed(closed, ticketType, transcript.participants)],
      });
      const attachment = new AttachmentBuilder(Buffer.from(transcript.text, "utf-8"), {
        name: `${closed.code ?? `ticket-${ticketId}`}-transcript.txt`,
      });
      await reviewChannel.send({
        content: buildTranscriptCodeBlock(transcript.text),
        files: [attachment],
      });
    }
  }

  if (closed.messageId) {
    const originalMessage = await channel.messages.fetch(closed.messageId).catch(() => null);
    if (originalMessage) {
      const baseEmbed = originalMessage.embeds[0]
        ? EmbedBuilder.from(originalMessage.embeds[0])
        : new EmbedBuilder();
      await originalMessage
        .edit({
          embeds: [applyTicketStatus(baseEmbed, closed)],
          components: [buildTicketButtons(closed)],
        })
        .catch(() => null);
    }
  }

  // Public notice everyone in the ticket channel can see, before the channel is removed.
  await channel
    .send(`This ticket has been closed by <@${interaction.user.id}>. It will close in 5 seconds.`)
    .catch(() => null);

  await interaction.update({ content: "Closing ticket…", components: [] });

  setTimeout(() => channel.delete().catch(() => null), 5000);
}

// Discord message content caps at 2000 chars; leave room for the code fences.
const CODE_BLOCK_LIMIT = 1900;

function buildTranscriptCodeBlock(text: string): string {
  const body =
    text.length > CODE_BLOCK_LIMIT
      ? `${text.slice(0, CODE_BLOCK_LIMIT)}\n… (truncated — see attached file for the full transcript)`
      : text;
  return `\`\`\`\n${body}\n\`\`\``;
}
