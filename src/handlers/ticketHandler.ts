import {
  ButtonInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalSubmitInteraction,
  OverwriteResolvable,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextChannel,
} from "discord.js";
import { getLeads, getTicketType } from "../db/ticketConfigRepo";
import { getGuildSettings } from "../db/guildSettingsRepo";
import { getManagers } from "../db/managerRepo";
import {
  claimTicket,
  closeToArchive,
  createTicket,
  getTicketByChannel,
  getTicketById,
  markDeleted,
  reopenTicket,
  setChannelId,
  setMessageId,
} from "../db/ticketRepo";
import { getQuestions } from "../db/questionRepo";
import { saveAnswers } from "../db/answerRepo";
import { Ticket, TicketTypeConfig } from "../types/ticket";
import { formatLeadsMention, resolveTemplate } from "../utils/ticketFormatter";
import {
  applyTicketStatus,
  buildDeleteConfirmRow,
  buildOutcomeButtons,
  buildTicketButtons,
  buildTicketEmbed,
} from "../utils/ticketEmbeds";
import {
  CLOSE_REASON_FIELD,
  buildCloseReasonModal,
  buildTicketDetailsModal,
  questionFieldId,
} from "../utils/ticketModal";
import { outcomeByIndex } from "../utils/closeOutcomes";
import { TICKET_CAP_MESSAGE, canClaim, canClose, canOpenNewTicket, canUnclaim } from "../utils/ticketAuth";
import { recordAudit, recordClaimHistory } from "../db/auditRepo";
import { applyClaimChange } from "../utils/claimActions";
import { postTranscript } from "../utils/ticketClosure";
import { makeChannelStaffOnly, moveToArchiveCategory, restoreTicketChannel } from "../utils/ticketPermissions";
import { updateTicketMessage } from "../utils/ticketMessage";
import { buildPanelContent } from "../utils/ticketPanel";
import {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_MODAL_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_DELETE_CONFIRM_PREFIX,
  TICKET_DELETE_PREFIX,
  TICKET_OUTCOME_PREFIX,
  TICKET_REOPEN_PREFIX,
  TICKET_STAFFONLY_PREFIX,
  TICKET_TAKEOVER_PREFIX,
  TICKET_UNCLAIM_PREFIX,
} from "./ticketConstants";

export {
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_MODAL_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_DELETE_CANCEL_PREFIX,
  TICKET_DELETE_CONFIRM_PREFIX,
  TICKET_DELETE_PREFIX,
  TICKET_OUTCOME_PREFIX,
  TICKET_REOPEN_PREFIX,
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

  // Authoritative cap check (the pre-modal check can race if two modals are opened).
  if (!canOpenNewTicket(guildId, interaction.user.id, interaction.memberPermissions)) {
    await interaction.reply({ content: TICKET_CAP_MESSAGE, flags: MessageFlags.Ephemeral });
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

  // Each overwrite states its `type` explicitly. Without it, discord.js tries to
  // resolve the id against its user/role cache to guess the type and throws
  // "not a cached User or Role" for any staff/manager who isn't currently cached.
  const viewerAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, type: OverwriteType.Member, allow: viewerAllow },
    {
      id: interaction.client.user.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
    ...[...new Set([...leads, ...getManagers(guildId)])].map((viewerId) => ({
      id: viewerId,
      type: OverwriteType.Member,
      allow: viewerAllow,
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

/**
 * Shared entry for both `/ticket create` and the panel dropdown: runs the open
 * guards (type enabled, under the per-user cap, questions configured) and shows
 * the create modal. Callers only need to resolve the ticket type first.
 */
export async function showTicketCreateModal(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  guildId: string,
  ticketType: TicketTypeConfig
): Promise<void> {
  if (!ticketType.enabled) {
    await interaction.reply({
      content: `**${ticketType.displayName}** tickets are currently closed.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canOpenNewTicket(guildId, interaction.user.id, interaction.memberPermissions)) {
    await interaction.reply({ content: TICKET_CAP_MESSAGE, flags: MessageFlags.Ephemeral });
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

/** Ticket panel's select menu: resolves the picked type, then shows the create modal. */
export async function handleTicketPanelSelect(interaction: StringSelectMenuInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const ticketType = getTicketType(guildId, interaction.values[0]);
  if (!ticketType) {
    await interaction.reply({
      content: "This ticket type is no longer configured.",
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await showTicketCreateModal(interaction, guildId, ticketType);
  }

  // Re-render the panel's dropdown so the user's pick doesn't stay selected —
  // otherwise they can't choose the same option twice in a row.
  const content = buildPanelContent(guildId);
  if (content) {
    await interaction.message.edit({ components: [content.row] }).catch(() => null);
  }
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

/** Close button (staff only): shows the outcome-picker buttons. */
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

  if (ticket.status === "closed" || ticket.status === "deleted") {
    await interaction.reply({ content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({
      content: "Only staff, the claimant, or a manager can close this ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: "How was this ticket resolved? Pick an outcome to close it:",
    components: buildOutcomeButtons(ticketId),
    flags: MessageFlags.Ephemeral,
  });
}

/** An outcome button was clicked: pop the optional-reason modal (carrying the outcome). */
export async function handleTicketOutcomeSelect(interaction: ButtonInteraction) {
  const rest = interaction.customId.slice(TICKET_OUTCOME_PREFIX.length); // "<ticketId>:<index>"
  const [ticketIdRaw, indexRaw] = rest.split(":");
  const ticketId = Number(ticketIdRaw);
  const outcomeIndex = Number(indexRaw);
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status === "closed" || ticket.status === "deleted") {
    await interaction.reply({ content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({ content: "You don't have permission to close this ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  const outcome = outcomeByIndex(outcomeIndex) ?? "Other";
  await interaction.showModal(buildCloseReasonModal(ticketId, outcomeIndex, outcome));
}

/**
 * Close modal submit (stage 1): records the outcome/reason, moves the channel to the
 * archive category, removes everyone but staff/managers, and swaps in the Delete button.
 * The channel is kept so staff can still review it; deletion is a separate step.
 */
export async function handleTicketCloseModalSubmit(interaction: ModalSubmitInteraction) {
  const rest = interaction.customId.slice(TICKET_CLOSE_MODAL_PREFIX.length); // "<ticketId>:<index>"
  const [ticketIdRaw, indexRaw] = rest.split(":");
  const ticketId = Number(ticketIdRaw);
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status === "closed" || ticket.status === "deleted") {
    await interaction.reply({ content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.channel;
  if (!(channel instanceof TextChannel)) {
    await interaction.reply({ content: "This ticket's channel is unavailable.", flags: MessageFlags.Ephemeral });
    return;
  }

  const outcome = outcomeByIndex(Number(indexRaw)) ?? "Other";
  const reason = safeField(interaction, CLOSE_REASON_FIELD).trim() || null;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const closed = closeToArchive(ticketId, interaction.user.id, reason, outcome);
  if (!closed) {
    await interaction.editReply({ content: "Couldn't close this ticket." });
    return;
  }
  recordAudit({
    guildId: closed.guildId,
    ticketId: closed.id,
    ticketCode: closed.code ?? undefined,
    actorId: interaction.user.id,
    eventType: "ticket_closed",
    newValue: outcome ?? undefined,
  });

  // Park in the archive category, but leave everyone's access intact — staff can
  // lock it down later with "Make Staff Only".
  await moveToArchiveCategory(channel, closed);
  await updateTicketMessage(interaction.client, closed, ticketType);

  await channel
    .send(
      `This ticket has been closed by <@${interaction.user.id}>${outcome ? ` — **${outcome}**` : ""}. ` +
        "Staff can **Reopen** it, **Make Staff Only** to hide it from non-staff, or **Delete Channel** to remove it."
    )
    .catch(() => null);

  await interaction.editReply({
    content: "Ticket closed. Everyone still has access — use **Make Staff Only** to lock it down, or **Delete Channel** when you're done.",
  });
}

/** "Make Staff Only" button: removes the creator/participants from a closed ticket channel. */
export async function handleTicketMakeStaffOnly(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_STAFFONLY_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({ content: "Only staff can do that.", flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.channel;
  if (!(channel instanceof TextChannel)) {
    await interaction.reply({ content: "This ticket's channel is unavailable.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  await makeChannelStaffOnly(channel, ticket);
  await channel
    .send(`<@${interaction.user.id}> made this channel staff-only. Non-staff can no longer see it.`)
    .catch(() => null);
}

/**
 * Delete button (stage 2): posts the transcript to the archive channel, verifies it
 * landed, then removes the channel. If archiving fails the channel is kept so nothing
 * is lost.
 */
export async function handleTicketDelete(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_DELETE_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({ content: "You don't have permission to delete this ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Step 1 of the two-step delete: ask for confirmation before doing anything.
  await interaction.reply({
    content: "Are you sure you want to delete this channel? The transcript is saved to the archive channel first, and this can't be undone.",
    components: [buildDeleteConfirmRow(ticketId)],
    flags: MessageFlags.Ephemeral,
  });
}

/** Delete confirmation "Cancel": dismisses the prompt, channel stays. */
export async function handleTicketDeleteCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: "Delete cancelled — the channel is still here.", components: [] });
}

/** Delete confirmation "Yes": saves the transcript (verified), then removes the channel. */
export async function handleTicketDeleteConfirm(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_DELETE_CONFIRM_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.update({ content: "Ticket not found.", components: [] });
    return;
  }
  const { ticket, ticketType } = found;

  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.update({ content: "You don't have permission to delete this ticket.", components: [] });
    return;
  }

  const channel = interaction.channel;
  if (!(channel instanceof TextChannel)) {
    await interaction.update({ content: "This ticket's channel is unavailable.", components: [] });
    return;
  }

  await interaction.update({ content: "Saving transcript and deleting…", components: [] });

  const archive = await postTranscript(interaction.client, ticket, ticketType, channel);
  if (!archive.ok) {
    await interaction.editReply({
      content: archive.noTarget
        ? "No archive channel is configured, so there's nowhere to save the transcript. Set one with `/ticket-config archive-channel` first, then Delete again."
        : `Couldn't save the transcript (${archive.error ?? "unknown error"}), so the channel was kept. Try Delete again once it's resolved.`,
    });
    return;
  }

  markDeleted(ticket.id);
  await channel.send("Transcript saved. Deleting this channel in 5 seconds.").catch(() => null);
  setTimeout(() => channel.delete().catch(() => null), 5000);
}

/** Reopen a closed ticket: back to active, channel restored to the ticket category, access returned. */
export async function handleTicketReopen(interaction: ButtonInteraction) {
  const ticketId = Number(interaction.customId.slice(TICKET_REOPEN_PREFIX.length));
  const found = resolveTicketAndType(ticketId);
  if (!found) {
    await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { ticket, ticketType } = found;

  if (ticket.status !== "closed") {
    await interaction.reply({ content: "This ticket can't be reopened.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canClose(authCtx(interaction, ticket, ticketType))) {
    await interaction.reply({ content: "You don't have permission to reopen this ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  const reopened = reopenTicket(ticketId);
  if (!reopened) {
    await interaction.reply({ content: "Couldn't reopen this ticket.", flags: MessageFlags.Ephemeral });
    return;
  }
  recordAudit({
    guildId: reopened.guildId,
    ticketId: reopened.id,
    ticketCode: reopened.code ?? undefined,
    actorId: interaction.user.id,
    eventType: "ticket_reopened",
  });

  await interaction.deferUpdate();
  const channel = interaction.channel;
  if (channel instanceof TextChannel) {
    await restoreTicketChannel(channel, reopened);
    await channel.send(`This ticket was reopened by <@${interaction.user.id}>.`).catch(() => null);
  }
  await updateTicketMessage(interaction.client, reopened, ticketType);
}

/** `/transcript`: post the current channel's transcript to the archive channel, anytime. */
export async function handleTranscriptCommand(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const ticket = channel ? getTicketByChannel(channel.id) : null;
  if (!guildId || !ticket) {
    await interaction.reply({ content: "Run this inside a ticket channel.", flags: MessageFlags.Ephemeral });
    return;
  }
  const ticketType = getTicketType(guildId, ticket.typeKey);
  if (!ticketType) {
    await interaction.reply({ content: "This ticket's type no longer exists.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canClose({ userId: interaction.user.id, permissions: interaction.memberPermissions, ticket, ticketType })) {
    await interaction.reply({ content: "You don't have permission to do that here.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(channel instanceof TextChannel)) {
    await interaction.reply({ content: "This channel is unavailable.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const archive = await postTranscript(interaction.client, ticket, ticketType, channel);
  await interaction.editReply({
    content: archive.ok
      ? "Transcript posted to the archive channel."
      : archive.noTarget
        ? "No archive channel is configured. Set one with `/ticket-config archive-channel` first."
        : `Couldn't post the transcript: ${archive.error ?? "unknown error"}.`,
  });
}

function safeField(interaction: ModalSubmitInteraction, fieldId: string): string {
  try {
    return interaction.fields.getTextInputValue(fieldId);
  } catch {
    return "";
  }
}
