import { Command } from "./types";
import { applyCommand } from "./apply";
import { applyQuestionCommand } from "./apply-question";
import { applySetupCommand } from "./apply-setup";
import { applicationsCommand } from "./applications";

export const commands: Command[] = [
  applyCommand,
  applyQuestionCommand,
  applySetupCommand,
  applicationsCommand,
];
