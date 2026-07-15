import {
  ActionRowBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextChannel,
} from "discord.js";
import { getGuildSettings, setPanelInfo } from "../../db/guildSettingsRepo";
import { getTicketTypes } from "../../db/ticketConfigRepo";
import { TICKET_PANEL_SELECT_ID } from "../../handlers/ticketConstants";
import { Command } from "../types";

export const ticketPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Post or update the ticket creation panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("post")
        .setDescription("Post (or move/refresh) the ticket panel in a channel.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the panel in")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const types = getTicketTypes(guildId);
    if (types.length === 0) {
      await interaction.reply({
        content: "No ticket types are configured yet.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channelOption = interaction.options.getChannel("channel", true);
    const targetChannel = await interaction.client.channels
      .fetch(channelOption.id)
      .catch(() => null);
    if (!(targetChannel instanceof TextChannel)) {
      await interaction.reply({
        content: "That channel isn't usable.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("Open a Ticket")
      .setColor(0x5865f2)
      .setDescription(
        `${types.map((t) => `**${t.displayName}** — ${t.department}`).join("\n")}\n\nSelect a category below to get started.`
      );

    const select = new StringSelectMenuBuilder()
      .setCustomId(TICKET_PANEL_SELECT_ID)
      .setPlaceholder("Select a ticket type...")
      .addOptions(
        types.map((t) => ({
          label: t.displayName,
          value: t.typeKey,
          description: t.department.slice(0, 100),
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const settings = getGuildSettings(guildId);
    let posted = null;
    if (settings.panelChannelId === channelOption.id && settings.panelMessageId) {
      const existing = await targetChannel.messages
        .fetch(settings.panelMessageId)
        .catch(() => null);
      if (existing) {
        posted = await existing.edit({ embeds: [embed], components: [row] });
      }
    }
    if (!posted) {
      posted = await targetChannel.send({ embeds: [embed], components: [row] });
    }

    setPanelInfo(guildId, channelOption.id, posted.id);

    await interaction.reply({
      content: `Ticket panel posted in <#${channelOption.id}>. Re-run this command any time (e.g. after adding a ticket type) to refresh it in place.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
