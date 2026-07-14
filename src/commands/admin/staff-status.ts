import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getLeads, getTicketTypes } from "../../db/ticketConfigRepo";
import { getCounts } from "../../db/ticketRepo";
import { Command } from "../types";

export const staffStatusCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("staff-status")
    .setDescription("View all ticket types, their leads, and live ticket counts.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const types = getTicketTypes(guildId);
    if (types.length === 0) {
      await interaction.reply({
        content: "No ticket types are configured yet.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder().setTitle("Ticket System Status").setColor(0x5865f2);

    for (const type of types) {
      const leads = getLeads(type.id);
      const counts = getCounts(guildId, type.typeKey);
      embed.addFields({
        name: `${type.displayName} — ${type.department}`,
        value: [
          `Leads: ${leads.length > 0 ? leads.map((id) => `<@${id}>`).join(", ") : "*none assigned*"}`,
          `Open: **${counts.open}** · Claimed: **${counts.claimed}** · Closed: **${counts.closed}**`,
          `Review channel: ${type.reviewChannelId ? `<#${type.reviewChannelId}>` : "*not set*"}`,
        ].join("\n"),
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
