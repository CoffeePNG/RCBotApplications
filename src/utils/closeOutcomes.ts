/** The structured outcomes a ticket can be closed with (shown as buttons). */
export const CLOSE_OUTCOMES = ["Approved", "Denied", "Withdrawn", "No Response", "Other"] as const;

export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

/** Resolves an outcome from its button index; null if out of range. */
export function outcomeByIndex(index: number): CloseOutcome | null {
  return CLOSE_OUTCOMES[index] ?? null;
}
