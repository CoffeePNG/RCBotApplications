import { REST, Routes } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";

const body = commands.map((command) => command.data.toJSON());

const rest = new REST().setToken(config.token);

async function main() {
  console.log(`Deploying ${body.length} guild slash commands...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body,
  });
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
