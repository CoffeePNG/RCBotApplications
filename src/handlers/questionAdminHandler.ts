import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  MAX_QUESTIONS,
  addQuestion,
  getQuestionById,
  getQuestions,
  moveQuestion,
  removeQuestion,
  replaceQuestions,
} from "../db/questionRepo";
import { getTicketType } from "../db/ticketConfigRepo";
import { recordAudit } from "../db/auditRepo";
import { DEFAULT_QUESTIONS } from "../seed/defaultQuestions";
import { QuestionStyle, TicketQuestion } from "../types/ticket";

export const Q_SELECT = "qcfg_select:";
export const Q_ADD = "qcfg_add:";
export const Q_RESET = "qcfg_reset:";
export const Q_EDIT = "qcfg_edit:";
export const Q_REMOVE = "qcfg_remove:";
export const Q_UP = "qcfg_up:";
export const Q_DOWN = "qcfg_down:";
export const Q_ADD_MODAL = "qcfg_add_modal:";
export const Q_EDIT_MODAL = "qcfg_edit_modal:";

function isAdmin(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): boolean {
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

/** Builds the ephemeral questions-management panel; `selectedId` reveals per-question actions. */
export function buildQuestionsPanel(guildId: string, typeKey: string, selectedId?: number) {
  const ticketType = getTicketType(guildId, typeKey);
  const questions = getQuestions(guildId, typeKey);
  const displayName = ticketType?.displayName ?? typeKey;

  const embed = new EmbedBuilder()
    .setTitle(`Questions — ${displayName}`)
    .setColor(0x5865f2)
    .setDescription(
      questions.length > 0
        ? questions
            .map(
              (q, i) =>
                `**${i + 1}.** ${q.label}\n *${q.inputStyle}, ${q.required ? "required" : "optional"}*`
            )
            .join("\n")
        : "*No questions yet. Add at least one before this type can be opened.*"
    )
    .setFooter({ text: `${questions.length}/${MAX_QUESTIONS} questions` });

  const rows: ActionRowBuilder<any>[] = [];

  if (questions.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${Q_SELECT}${typeKey}`)
      .setPlaceholder("Select a question to edit, move, or remove…")
      .addOptions(
        questions.map((q, i) => ({
          label: `${i + 1}. ${q.label}`.slice(0, 100),
          value: String(q.id),
          default: q.id === selectedId,
        }))
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${Q_ADD}${typeKey}`)
        .setLabel("Add Question")
        .setStyle(ButtonStyle.Success)
        .setDisabled(questions.length >= MAX_QUESTIONS),
      new ButtonBuilder()
        .setCustomId(`${Q_RESET}${typeKey}`)
        .setLabel("Reset to Default")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!DEFAULT_QUESTIONS[typeKey])
    )
  );

  const selected = selectedId != null ? questions.find((q) => q.id === selectedId) : undefined;
  if (selected) {
    const index = questions.findIndex((q) => q.id === selected.id);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${Q_EDIT}${typeKey}:${selected.id}`).setLabel("Edit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${Q_REMOVE}${typeKey}:${selected.id}`).setLabel("Remove").setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${Q_UP}${typeKey}:${selected.id}`)
          .setLabel("Move Up")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(index === 0),
        new ButtonBuilder()
          .setCustomId(`${Q_DOWN}${typeKey}:${selected.id}`)
          .setLabel("Move Down")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(index === questions.length - 1)
      )
    );
  }

  return { embeds: [embed], components: rows };
}

function buildQuestionModal(customId: string, title: string, existing?: TicketQuestion): ModalBuilder {
  const label = new TextInputBuilder()
    .setCustomId("label")
    .setLabel("Question")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(45);
  const placeholder = new TextInputBuilder()
    .setCustomId("placeholder")
    .setLabel("Placeholder (optional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);
  const style = new TextInputBuilder()
    .setCustomId("style")
    .setLabel("Style: short or paragraph")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10)
    .setValue(existing?.inputStyle ?? "paragraph");
  const required = new TextInputBuilder()
    .setCustomId("required")
    .setLabel("Required? yes or no")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(5)
    .setValue(existing ? (existing.required ? "yes" : "no") : "yes");

  if (existing) {
    label.setValue(existing.label);
    if (existing.placeholder) placeholder.setValue(existing.placeholder);
  }

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(label),
      new ActionRowBuilder<TextInputBuilder>().addComponents(placeholder),
      new ActionRowBuilder<TextInputBuilder>().addComponents(style),
      new ActionRowBuilder<TextInputBuilder>().addComponents(required)
    );
}

function parseStyle(value: string): QuestionStyle {
  return value.trim().toLowerCase().startsWith("s") ? "short" : "paragraph";
}
function parseRequired(value: string): boolean {
  return !["no", "n", "false", "0"].includes(value.trim().toLowerCase());
}

export async function handleQuestionSelect(interaction: StringSelectMenuInteraction) {
  if (!isAdmin(interaction) || !interaction.guildId) return;
  const typeKey = interaction.customId.slice(Q_SELECT.length);
  const selectedId = Number(interaction.values[0]);
  await interaction.update(buildQuestionsPanel(interaction.guildId, typeKey, selectedId));
}

export async function handleQuestionButton(interaction: ButtonInteraction) {
  if (!isAdmin(interaction) || !interaction.guildId) return;
  const guildId = interaction.guildId;

  if (interaction.customId.startsWith(Q_ADD)) {
    const typeKey = interaction.customId.slice(Q_ADD.length);
    await interaction.showModal(buildQuestionModal(`${Q_ADD_MODAL}${typeKey}`, "Add Question"));
    return;
  }
  if (interaction.customId.startsWith(Q_EDIT)) {
    const [typeKey, qid] = interaction.customId.slice(Q_EDIT.length).split(":");
    const question = getQuestionById(Number(qid));
    if (!question) {
      await interaction.reply({ content: "That question no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildQuestionModal(`${Q_EDIT_MODAL}${typeKey}:${qid}`, "Edit Question", question));
    return;
  }
  if (interaction.customId.startsWith(Q_REMOVE)) {
    const [typeKey, qid] = interaction.customId.slice(Q_REMOVE.length).split(":");
    removeQuestion(guildId, typeKey, Number(qid));
    recordAudit({ guildId, actorId: interaction.user.id, eventType: "questions_changed", newValue: `removed from ${typeKey}` });
    await interaction.update(buildQuestionsPanel(guildId, typeKey));
    return;
  }
  if (interaction.customId.startsWith(Q_UP) || interaction.customId.startsWith(Q_DOWN)) {
    const up = interaction.customId.startsWith(Q_UP);
    const [typeKey, qid] = interaction.customId.slice((up ? Q_UP : Q_DOWN).length).split(":");
    moveQuestion(guildId, typeKey, Number(qid), up ? "up" : "down");
    await interaction.update(buildQuestionsPanel(guildId, typeKey, Number(qid)));
    return;
  }
  if (interaction.customId.startsWith(Q_RESET)) {
    const typeKey = interaction.customId.slice(Q_RESET.length);
    const defaults = DEFAULT_QUESTIONS[typeKey];
    if (defaults) {
      replaceQuestions(guildId, typeKey, defaults);
      recordAudit({ guildId, actorId: interaction.user.id, eventType: "questions_changed", newValue: `reset ${typeKey} to default` });
    }
    await interaction.update(buildQuestionsPanel(guildId, typeKey));
    return;
  }
}

export async function handleQuestionModalSubmit(interaction: ModalSubmitInteraction) {
  if (!isAdmin(interaction) || !interaction.guildId) return;
  const guildId = interaction.guildId;

  const label = interaction.fields.getTextInputValue("label").trim();
  const placeholder = interaction.fields.getTextInputValue("placeholder").trim() || null;
  const inputStyle = parseStyle(interaction.fields.getTextInputValue("style"));
  const required = parseRequired(interaction.fields.getTextInputValue("required"));

  if (!label) {
    await interaction.reply({ content: "The question label can't be blank.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.customId.startsWith(Q_ADD_MODAL)) {
    const typeKey = interaction.customId.slice(Q_ADD_MODAL.length);
    const added = addQuestion(guildId, typeKey, { label, placeholder, inputStyle, required });
    if (!added) {
      await interaction.reply({
        content: `That type already has the maximum of ${MAX_QUESTIONS} questions.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    recordAudit({ guildId, actorId: interaction.user.id, eventType: "questions_changed", newValue: `added to ${typeKey}` });
    await interaction.reply({ ...buildQuestionsPanel(guildId, typeKey), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.customId.startsWith(Q_EDIT_MODAL)) {
    const [typeKey, qid] = interaction.customId.slice(Q_EDIT_MODAL.length).split(":");
    const { updateQuestion } = await import("../db/questionRepo");
    updateQuestion(Number(qid), { label, placeholder, inputStyle, required });
    recordAudit({ guildId, actorId: interaction.user.id, eventType: "questions_changed", newValue: `edited in ${typeKey}` });
    await interaction.reply({ ...buildQuestionsPanel(guildId, typeKey, Number(qid)), flags: MessageFlags.Ephemeral });
    return;
  }
}
