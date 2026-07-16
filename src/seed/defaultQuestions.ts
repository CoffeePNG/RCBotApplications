import { NewQuestion, seedQuestionsIfEmpty } from "../db/questionRepo";

/** Default question sets per ticket type (from the build spec). */
export const DEFAULT_QUESTIONS: Record<string, NewQuestion[]> = {
  application: [
    { label: "What position are you applying for?", placeholder: null, inputStyle: "short", required: true },
    { label: "Why are you interested in the position?", placeholder: null, inputStyle: "paragraph", required: true },
    { label: "What relevant experience do you have?", placeholder: null, inputStyle: "paragraph", required: false },
    { label: "What is your usual availability?", placeholder: null, inputStyle: "short", required: false },
    { label: "Is there anything else we should know?", placeholder: null, inputStyle: "paragraph", required: false },
  ],
  bug_report: [
    { label: "What happened?", placeholder: null, inputStyle: "paragraph", required: true },
    { label: "What did you expect to happen?", placeholder: null, inputStyle: "paragraph", required: false },
    { label: "How can the issue be reproduced?", placeholder: null, inputStyle: "paragraph", required: false },
    { label: "Where did the issue occur?", placeholder: null, inputStyle: "short", required: false },
    { label: "Do you have evidence or additional details?", placeholder: null, inputStyle: "paragraph", required: false },
  ],
  appeal: [
    { label: "What punishment are you appealing?", placeholder: null, inputStyle: "short", required: true },
    { label: "When were you punished?", placeholder: null, inputStyle: "short", required: false },
    { label: "Who issued the punishment, if known?", placeholder: null, inputStyle: "short", required: false },
    { label: "Why should the punishment be reconsidered?", placeholder: null, inputStyle: "paragraph", required: true },
    { label: "Is there evidence staff should review?", placeholder: null, inputStyle: "paragraph", required: false },
  ],
  help_request: [
    { label: "What do you need help with?", placeholder: null, inputStyle: "paragraph", required: true },
    { label: "Where are you experiencing the issue?", placeholder: null, inputStyle: "short", required: false },
    { label: "What have you already tried?", placeholder: null, inputStyle: "paragraph", required: false },
    { label: "When did the issue begin?", placeholder: null, inputStyle: "short", required: false },
    { label: "Is there anything else that may help staff?", placeholder: null, inputStyle: "paragraph", required: false },
  ],
};

/** A single generic starter question for any type without a specific default set. */
const GENERIC_QUESTION: NewQuestion[] = [
  { label: "What's this about?", placeholder: null, inputStyle: "paragraph", required: true },
];

export function seedDefaultQuestions(guildId: string, typeKey: string): void {
  seedQuestionsIfEmpty(guildId, typeKey, DEFAULT_QUESTIONS[typeKey] ?? GENERIC_QUESTION);
}
