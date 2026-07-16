import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { addLead, getLeads, getTicketType, getTicketTypes, removeLead } from "../../db/ticketConfigRepo";
import { addManager, getManagers, removeManager } from "../../db/managerRepo";
import { getActiveTicketsClaimedBy } from "../../db/ticketRepo";
import { recordAudit } from "../../db/auditRepo";
import { respondTicketTypeAutocomplete } from "../../utils/ticketTypeAutocomplete";
import { syncManagerAdded, syncManagerRemoved, syncStaffAdded, syncStaffRemoved } from "../../utils/ticketPermissions";
import { applyClaimChange } from "../../utils/claimActions";
import { hasResidualTicketAccess } from "../../utils/ticketAuth";
import { Command } from "../types";

const TYPE_DESC = "The ticket type";

export const staffCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Manage ticket-type staff and Ticket Managers.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Assign a user as staff for a ticket type.")
        .addStringOption((o) => o.setName("type").setDescription(TYPE_DESC).setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a user's staff assignment for a ticket type.")
        .addStringOption((o) => o.setName("type").setDescription(TYPE_DESC).setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("List staff for a ticket type (or all types).")
        .addStringOption((o) => o.setName("type").setDescription(TYPE_DESC).setRequired(false).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("manager-add")
        .setDescription("Assign a user as a global Ticket Manager (all ticket types).")
        .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("manager-remove")
        .setDescription("Remove a user's Ticket Manager assignment.")
        .addUserOption((o) => o.setName("user").setDescription("The user").setRequired(true))
    )
    .addSubcommand((s) => s.setName("manager-list").setDescription("List the current Ticket Managers.")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const sub = interaction.options.getSubcommand();

    if (sub === "manager-list") {
      const managers = getManagers(guildId);
      await interaction.reply({
        content: managers.length ? `Ticket Managers: ${managers.map((id) => `<@${id}>`).join(", ")}` : "No Ticket Managers assigned.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "manager-add" || sub === "manager-remove") {
      const user = interaction.options.getUser("user", true);
      if (sub === "manager-add") {
        const added = addManager(guildId, user.id, interaction.user.id);
        if (added) {
          await syncManagerAdded(interaction.client, guildId, user.id);
          recordAudit({ guildId, actorId: interaction.user.id, targetId: user.id, eventType: "staff_added", newValue: "manager" });
        }
        await interaction.reply({
          content: added ? `${user.tag} is now a Ticket Manager.` : `${user.tag} is already a Ticket Manager.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        const removed = removeManager(guildId, user.id);
        if (removed) {
          await syncManagerRemoved(interaction.client, guildId, user.id);
          await unclaimOnAccessLoss(interaction, guildId, user.id);
          recordAudit({ guildId, actorId: interaction.user.id, targetId: user.id, eventType: "staff_removed", newValue: "manager" });
        }
        await interaction.reply({
          content: removed ? `${user.tag} is no longer a Ticket Manager.` : `${user.tag} wasn't a Ticket Manager.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (sub === "list") {
      const typeKey = interaction.options.getString("type");
      const types = typeKey ? [getTicketType(guildId, typeKey)].filter((t) => t) : getTicketTypes(guildId);
      if (types.length === 0) {
        await interaction.reply({ content: "No ticket types found.", flags: MessageFlags.Ephemeral });
        return;
      }
      const lines = types.map((t) => {
        const leads = getLeads(t!.id);
        return `**${t!.displayName}**: ${leads.length ? leads.map((id) => `<@${id}>`).join(", ") : "*none*"}`;
      });
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
      return;
    }

    // add / remove type staff
    const typeKey = interaction.options.getString("type", true);
    const user = interaction.options.getUser("user", true);
    const ticketType = getTicketType(guildId, typeKey);
    if (!ticketType) {
      await interaction.reply({ content: "Unknown ticket type.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "add") {
      const added = addLead(ticketType.id, user.id);
      if (added) {
        await syncStaffAdded(interaction.client, guildId, typeKey, user.id);
        recordAudit({ guildId, actorId: interaction.user.id, targetId: user.id, eventType: "staff_added", newValue: typeKey });
      }
      await interaction.reply({
        content: added
          ? `${user.tag} is now staff for **${ticketType.displayName}**.`
          : `${user.tag} is already staff for **${ticketType.displayName}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // remove
    const removed = removeLead(ticketType.id, user.id);
    if (removed) {
      await syncStaffRemoved(interaction.client, guildId, typeKey, user.id);
      await unclaimOnAccessLoss(interaction, guildId, user.id, typeKey);
      recordAudit({ guildId, actorId: interaction.user.id, targetId: user.id, eventType: "staff_removed", newValue: typeKey });
    }
    await interaction.reply({
      content: removed
        ? `${user.tag} is no longer staff for **${ticketType.displayName}**.`
        : `${user.tag} wasn't staff for **${ticketType.displayName}**.`,
      flags: MessageFlags.Ephemeral,
    });
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondTicketTypeAutocomplete(interaction);
  },
};

/** Unclaims a user's active tickets that they can no longer access after losing a permission source. */
async function unclaimOnAccessLoss(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  userId: string,
  onlyTypeKey?: string
): Promise<void> {
  for (const ticket of getActiveTicketsClaimedBy(guildId, userId)) {
    if (onlyTypeKey && ticket.typeKey !== onlyTypeKey) continue;
    const ticketType = getTicketType(guildId, ticket.typeKey);
    if (!ticketType) continue;
    if (hasResidualTicketAccess(ticket, ticketType, userId)) continue;
    await applyClaimChange(interaction.client, ticket, ticketType, null, interaction.user.id, "unclaim");
  }
}
