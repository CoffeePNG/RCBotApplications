import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { MAX_QUESTIONS } from "../config";
import { addQuestion, getQuestions, removeQuestion } from "../db/database";
import { Command } from "./types";

export const applyQuestionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("apply-question")
    .setDescription("Manage the questions asked on the staff application form.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription(`Add a question (max ${MAX_QUESTIONS} total).`)
        .addStringOption((opt) =>
          opt
            .setName("label")
            .setDescription("The question text shown to applicants")
            .setRequired(true)
            .setMaxLength(45)
        )
        .addStringOption((opt) =>
          opt
            .setName("style")
            .setDescription("Answer field type")
            .setRequired(true)
            .addChoices(
              { name: "Short answer", value: "short" },
              { name: "Paragraph", value: "paragraph" }
            )
        )
        .addBooleanOption((opt) =>
          opt
            .setName("required")
            .setDescription("Whether applicants must answer this question")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("placeholder")
            .setDescription("Placeholder/example text shown in the empty field")
            .setRequired(false)
            .setMaxLength(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a question by its list position.")
        .addIntegerOption((opt) =>
          opt
            .setName("position")
            .setDescription("Position as shown in /apply-question list")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List the current application questions.")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const existing = getQuestions(guildId);
      if (existing.length >= MAX_QUESTIONS) {
        await interaction.reply({
          content: `You already have the maximum of ${MAX_QUESTIONS} questions. Remove one before adding another (Discord modals allow at most ${MAX_QUESTIONS} fields).`,
          ephemeral: true,
        });
        return;
      }

      const label = interaction.options.getString("label", true);
      const style = interaction.options.getString("style", true) as
        | "short"
        | "paragraph";
      const required = interaction.options.getBoolean("required", true);
      const placeholder = interaction.options.getString("placeholder");

      addQuestion(guildId, label, style, required, placeholder);
      await interaction.reply({
        content: `Question added: "${label}"`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "remove") {
      const position = interaction.options.getInteger("position", true) - 1;
      const removed = removeQuestion(guildId, position);
      await interaction.reply({
        content: removed
          ? "Question removed."
          : "No question found at that position. Check /apply-question list.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "list") {
      const questions = getQuestions(guildId);
      if (questions.length === 0) {
        await interaction.reply({
          content: "No questions configured yet. Add one with /apply-question add.",
          ephemeral: true,
        });
        return;
      }
      const lines = questions.map(
        (q, i) =>
          `${i + 1}. **${q.label}** (${q.style}${q.required ? ", required" : ", optional"})`
      );
      await interaction.reply({
        content: lines.join("\n"),
        ephemeral: true,
      });
    }
  },
};
