/** The structured outcomes a ticket can be closed with. */
export const CLOSE_OUTCOMES = [
  "Resolved",
  "Approved",
  "Denied",
  "Duplicate",
  "Invalid",
  "Withdrawn",
  "No Response",
  "Other",
] as const;

export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

/**
 * Maps free-typed modal input to a known outcome (case/space-insensitive).
 * Falls back to "Other" for unrecognized non-empty text, or null if blank.
 */
export function parseOutcome(raw: string | null | undefined): CloseOutcome | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  const match = CLOSE_OUTCOMES.find((o) => o.toLowerCase() === normalized);
  return match ?? "Other";
}
