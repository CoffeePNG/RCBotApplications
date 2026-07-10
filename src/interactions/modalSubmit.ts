import { ModalSubmitInteraction, TextChannel } from "discord.js";
import { APPLY_MODAL_ID, questionFieldId } from "../commands/apply";
import {
  AnswerSnapshot,
  createApplication,
  getGuildConfig,
  getQuestions,
  setReviewMessageId,
} from "../db/database";
import { buildApplicationEmbed, buildDecisionRow } from "./embeds";

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== APPLY_MODAL_ID) return;

  const guildId = interaction.guildId;
  if (!guildId) return;

  const questions = getQuestions(guildId);
  const answers: AnswerSnapshot[] = questions.map((question) => ({
    question: question.label,
    answer: interaction.fields.getTextInputValue(questionFieldId(question.id)).trim(),
  }));

  const application = createApplication(
    guildId,
    interaction.user.id,
    interaction.user.tag,
    answers
  );

  const cfg = getGuildConfig(guildId);
  if (cfg.reviewChannelId) {
    const channel = await interaction.client.channels.fetch(cfg.reviewChannelId).catch(() => null);
    if (channel && channel instanceof TextChannel) {
      const embed = buildApplicationEmbed(application, interaction.user);
      const row = buildDecisionRow(application.id, false);
      const message = await channel.send({ embeds: [embed], components: [row] });
      setReviewMessageId(application.id, message.id);
    }
  }

  await interaction.reply({
    content: "Your application has been submitted! Staff will review it soon.",
    ephemeral: true,
  });
}
