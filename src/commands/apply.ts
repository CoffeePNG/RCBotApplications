import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getGuildConfig, getPendingApplication, getQuestions } from "../db/database";
import { Command } from "./types";

export const APPLY_MODAL_ID = "staff_apply_modal";
export const questionFieldId = (questionId: number) => `question_${questionId}`;

export const applyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Apply for a staff position on this server."),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const cfg = getGuildConfig(guildId);
    if (!cfg.reviewChannelId || !cfg.staffRoleId) {
      await interaction.reply({
        content: "Staff applications aren't set up on this server yet. Please contact an admin.",
        ephemeral: true,
      });
      return;
    }

    const questions = getQuestions(guildId);
    if (questions.length === 0) {
      await interaction.reply({
        content: "No application questions are configured yet. Please contact an admin.",
        ephemeral: true,
      });
      return;
    }

    const pending = getPendingApplication(guildId, interaction.user.id);
    if (pending) {
      await interaction.reply({
        content: "You already have a pending application. Please wait for staff to review it.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(APPLY_MODAL_ID)
      .setTitle("Staff Application");

    for (const question of questions) {
      const input = new TextInputBuilder()
        .setCustomId(questionFieldId(question.id))
        .setLabel(question.label)
        .setStyle(
          question.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short
        )
        .setRequired(question.required);
      if (question.placeholder) {
        input.setPlaceholder(question.placeholder);
      }
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input)
      );
    }

    await interaction.showModal(modal);
  },
};
