import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { handleInteraction } from "./events/interactionCreate";
import { seedDefaultTicketTypes } from "./seed/defaultTicketTypes";
import "./db/connect";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, (readyClient) => {
  seedDefaultTicketTypes(config.guildId);
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, commandsByName);
});

client.login(config.token);
