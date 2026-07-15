import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { getGuildSettings, setPanelCustomization, setPanelInfo } from "../../db/guildSettingsRepo";
import { buildPanelContent, refreshPostedPanel } from "../../utils/ticketPanel";
import { Command } from "../types";

export const ticketPanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Post or customize the ticket creation panel.")
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("customize")
        .setDescription("Customize the panel's title/description, or reset to defaults.")
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Panel embed title").setMaxLength(256)
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Panel embed description. Use {types} to insert the ticket type list.")
            .setMaxLength(3800)
        )
        .addBooleanOption((opt) =>
          opt.setName("reset").setDescription("Reset title and description back to defaults")
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

    const sub = interaction.options.getSubcommand();

    if (sub === "customize") {
      const reset = interaction.options.getBoolean("reset") ?? false;
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");

      if (reset) {
        setPanelCustomization(guildId, null, null);
      } else if (title === null && description === null) {
        await interaction.reply({
          content: "Provide a title and/or description to change, or set reset:true.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      } else {
        setPanelCustomization(guildId, title, description);
      }

      const refreshed = await refreshPostedPanel(interaction.client, guildId);
      await interaction.reply({
        content: reset
          ? `Panel text reset to defaults.${refreshed ? " The live panel has been updated." : ""}`
          : `Panel text updated.${refreshed ? " The live panel has been updated." : " Run /ticket-panel post to publish it."}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // sub === "post"
    const content = buildPanelContent(guildId);
    if (!content) {
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

    const settings = getGuildSettings(guildId);
    let posted = null;
    if (settings.panelChannelId === channelOption.id && settings.panelMessageId) {
      const existing = await targetChannel.messages
        .fetch(settings.panelMessageId)
        .catch(() => null);
      if (existing) {
        posted = await existing.edit({ embeds: [content.embed], components: [content.row] });
      }
    }
    if (!posted) {
      posted = await targetChannel.send({ embeds: [content.embed], components: [content.row] });
    }

    setPanelInfo(guildId, channelOption.id, posted.id);

    await interaction.reply({
      content: `Ticket panel posted in <#${channelOption.id}>. Re-run this any time (e.g. after adding a ticket type) to refresh it in place.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
