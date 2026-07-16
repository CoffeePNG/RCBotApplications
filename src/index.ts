import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { handleInteraction } from "./events/interactionCreate";
import { seedDefaultTicketTypes } from "./seed/defaultTicketTypes";
import "./db/connect";

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[process] uncaught exception:", error);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, (readyClient) => {
  seedDefaultTicketTypes(config.guildId);
  console.log(
    `Logged in as ${readyClient.user.tag} — ${commandsByName.size} commands loaded, serving guild ${config.guildId}`
  );
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, commandsByName);
});

client.on(Events.Error, (error) => console.error("[client] websocket error:", error));

client.login(config.token).catch((error) => {
  console.error("[client] login failed:", error);
  process.exit(1);
});
