import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { handleInteraction } from "./events/interactionCreate";
import { seedDefaultTicketTypes } from "./seed/defaultTicketTypes";
import { reconcileClaimsOnStartup, releaseClaimsForDepartedMember } from "./utils/staffLifecycle";
import "./db/connect";

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[process] uncaught exception:", error);
});

const client = new Client({
  // GuildMessages + MessageContent are required to read what users typed for the
  // ticket transcript. GuildMembers lets us free a staff member's claimed tickets
  // when they leave the server. MessageContent and GuildMembers are privileged
  // intents — they must ALSO be enabled in the Discord Developer Portal
  // (Bot → Privileged Gateway Intents) or login will fail.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, (readyClient) => {
  seedDefaultTicketTypes(config.guildId);
  console.log(
    `Logged in as ${readyClient.user.tag} — ${commandsByName.size} commands loaded, serving guild ${config.guildId}`
  );
  void reconcileClaimsOnStartup(readyClient, config.guildId).catch((error) =>
    console.error("[startup] claim reconciliation failed:", error)
  );
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, commandsByName);
});

client.on(Events.GuildMemberRemove, (member) => {
  void releaseClaimsForDepartedMember(client, member.guild.id, member.id).catch((error) =>
    console.error("[guildMemberRemove] failed to release claims:", error)
  );
});

client.on(Events.Error, (error) => console.error("[client] websocket error:", error));

client.login(config.token).catch((error) => {
  console.error("[client] login failed:", error);
  process.exit(1);
});
