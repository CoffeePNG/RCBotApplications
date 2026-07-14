import { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";

export interface Command {
  data: {
    readonly name: string;
    toJSON(): unknown;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
