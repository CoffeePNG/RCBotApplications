import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  token: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("DISCORD_CLIENT_ID"),
  guildId: requireEnv("DISCORD_GUILD_ID"),
  databasePath: process.env.DATABASE_PATH || "data/applications.sqlite",
};

export const MAX_QUESTIONS = 5;
