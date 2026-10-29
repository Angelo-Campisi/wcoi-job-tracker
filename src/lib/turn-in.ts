// Turn-in rules (spec 6.5, 6.6) that don't need the database, so they can be tested.

export const MAX_SIGNED_NAME = 200;
export const MAX_REASON = 500;
/** Keeps the saved signature image well under the database limit (400,000 characters). */
export const MAX_SIGNATURE_CHARS = 380_000;

export type TurnInInput =
  | { mode: "signed"; signedName: string; hasInk: boolean }
  | { mode: "no-signature"; reason: string };

/** What's missing before the job can be turned in, or null when it's ready. */
export function turnInProblem(input: TurnInInput): string | null {
  if (input.mode === "signed") {
    if (!input.hasInk) return "Have the customer sign in the box.";
    if (input.signedName.trim() === "") return "Type the name of the person signing.";
    if (input.signedName.trim().length > MAX_SIGNED_NAME) return "That name is too long.";
    return null;
  }
  if (input.reason.trim() === "") return "Say why the customer can't sign.";
  if (input.reason.trim().length > MAX_REASON) return `Keep the reason under ${MAX_REASON} characters.`;
  return null;
}

export interface TurnInCheck {
  hoursTotal: number;
  /** Has hours entered today (the lead's only day to enter them). */
  hasHoursToday: boolean;
  pendingChangeOrders: number;
}

/**
 * Things worth a second look before turning in. None of them block turn-in;
 * they're shown so the lead doesn't lock the job by mistake.
 */
export function turnInWarnings(check: TurnInCheck): string[] {
  const warnings: string[] = [];
  if (check.hoursTotal === 0) {
    warnings.push("No hours have been entered on this job.");
  } else if (!check.hasHoursToday) {
    warnings.push("No hours entered for today. After turn-in you can't add them.");
  }
  if (check.pendingChangeOrders > 0) {
    warnings.push(
      check.pendingChangeOrders === 1
        ? "1 change order is still waiting for the owner. It stays with the job."
        : `${check.pendingChangeOrders} change orders are still waiting for the owner. They stay with the job.`,
    );
  }
  return warnings;
}

/** Each person's total hours on the job, largest first, for the customer summary. */
export function totalsByPerson(days: { rows: { name: string; hours: number }[] }[]): { name: string; hours: number }[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const row of day.rows) {
      totals.set(row.name, Math.round(((totals.get(row.name) ?? 0) + row.hours) * 100) / 100);
    }
  }
  return [...totals]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}
