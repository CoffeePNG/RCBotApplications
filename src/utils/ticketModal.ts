import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { TICKET_CLOSE_MODAL_PREFIX, TICKET_CREATE_MODAL_PREFIX } from "../handlers/ticketConstants";
import { getQuestions } from "../db/questionRepo";
import { TicketQuestion, TicketTypeConfig } from "../types/ticket";

/** Field customId prefix so modal-submit can map each field back to its question. */
export const QUESTION_FIELD_PREFIX = "q";

export function questionFieldId(question: TicketQuestion): string {
  return `${QUESTION_FIELD_PREFIX}${question.id}`;
}

/**
 * Builds the create modal dynamically from the type's active questions.
 * Returns null if the type has no questions (it can't be opened until it does).
 */
export function buildTicketDetailsModal(ticketType: TicketTypeConfig): ModalBuilder | null {
  const questions = getQuestions(ticketType.guildId, ticketType.typeKey);
  if (questions.length === 0) return null;

  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_CREATE_MODAL_PREFIX}:${ticketType.typeKey}`)
    .setTitle(ticketType.displayName.slice(0, 45));

  for (const question of questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(questionFieldId(question))
      .setLabel(question.label.slice(0, 45))
      .setStyle(question.inputStyle === "short" ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(question.required)
      .setMaxLength(question.inputStyle === "short" ? 200 : 1000);
    if (question.placeholder) input.setPlaceholder(question.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

export const CLOSE_REASON_FIELD = "reason";

/**
 * The optional-reason modal shown after an outcome button is picked. The outcome
 * index is carried in the customId (`<prefix><ticketId>:<index>`) so the submit
 * handler knows which outcome was chosen.
 */
export function buildCloseReasonModal(ticketId: number, outcomeIndex: number, outcomeLabel: string): ModalBuilder {
  const reason = new TextInputBuilder()
    .setCustomId(CLOSE_REASON_FIELD)
    .setLabel("Reason / note (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder("Optional — a short note for the record. Leave blank to just close.");

  return new ModalBuilder()
    .setCustomId(`${TICKET_CLOSE_MODAL_PREFIX}${ticketId}:${outcomeIndex}`)
    .setTitle(`Close — ${outcomeLabel}`.slice(0, 45))
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
}
