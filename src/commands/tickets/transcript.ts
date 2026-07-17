import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { handleTranscriptCommand } from "../../handlers/ticketHandler";
import { Command } from "../types";

export const transcriptCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("transcript")
    .setDescription("Post a transcript of this ticket channel to the archive channel."),

  async execute(interaction: ChatInputCommandInteraction) {
    await handleTranscriptCommand(interaction);
  },
};
