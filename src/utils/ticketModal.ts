import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { TICKET_CLOSE_MODAL_PREFIX, TICKET_CREATE_MODAL_PREFIX } from "../handlers/ticketConstants";
import { CLOSE_OUTCOMES } from "./closeOutcomes";
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

export const CLOSE_OUTCOME_FIELD = "outcome";
export const CLOSE_REASON_FIELD = "reason";

/** The close modal: a structured outcome + an optional free-text reason. */
export function buildCloseModal(ticketId: number): ModalBuilder {
  const outcome = new TextInputBuilder()
    .setCustomId(CLOSE_OUTCOME_FIELD)
    .setLabel("Outcome")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setPlaceholder(CLOSE_OUTCOMES.join(" / ").slice(0, 100));

  const reason = new TextInputBuilder()
    .setCustomId(CLOSE_REASON_FIELD)
    .setLabel("Reason (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder("A short note on why this ticket is being closed.");

  return new ModalBuilder()
    .setCustomId(`${TICKET_CLOSE_MODAL_PREFIX}${ticketId}`)
    .setTitle("Close Ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(outcome),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reason)
    );
}
