// Change order form rules (spec 6.7) that don't need the database.
import { changeOrderType } from "./budget";
import { sumHours } from "./hours";
import type { ChangeOrderType } from "./types";

export const MAX_CHANGE_HOURS = 500;
export const MAX_DESCRIPTION = 1000;

/** − / + buttons: half-hour steps; "+" on an empty field starts at 1 hour. */
export function stepChangeHours(current: number | null, direction: 1 | -1): number | null {
  if (current === null) return direction === 1 ? 1 : null;
  const next = sumHours([current, direction * 0.5]);
  if (next <= 0) return null;
  return Math.min(next, MAX_CHANGE_HOURS);
}

/** Reads what was typed in the hours box: "6", "6.5", "6,5". Null when empty or unreadable. */
export function parseHours(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** A problem with the change order, or null when it can be submitted. */
export function changeOrderProblem(hours: number | null, description: string): string | null {
  if (hours === null || !Number.isFinite(hours) || hours <= 0) return "Enter the extra hours.";
  if (!Number.isInteger(hours * 2)) return "Use half-hour steps, like 2, 2.5, or 3.";
  if (hours > MAX_CHANGE_HOURS) return `That's more than ${MAX_CHANGE_HOURS} hours. Check the number.`;
  if (description.trim() === "") return "Say what changed.";
  if (description.length > MAX_DESCRIPTION) return `Keep the description under ${MAX_DESCRIPTION} characters.`;
  return null;
}

/** What will happen on submit, in plain words, so the lead knows before tapping. */
export function changeOrderPreview(
  hours: number | null,
  thresholdHours: number,
  isHourlyJob: boolean,
): { type: ChangeOrderType | null; text: string } {
  if (hours === null || hours <= 0) {
    return {
      type: null,
      text: `Up to ${fmt(thresholdHours)} hrs is a quick change. More than that needs the owner's approval.`,
    };
  }
  const type = changeOrderType(hours, thresholdHours);
  const record = isHourlyJob ? " This is an hourly job, so it's kept as a record and doesn't change billing." : "";
  if (type === "quick") {
    return {
      type,
      text: `Quick change: ${isHourlyJob ? "approved right away." : "added to the budget right away."}${record}`,
    };
  }
  return {
    type,
    text: `Large change (over ${fmt(thresholdHours)} hrs): the owner must approve it before ${
      isHourlyJob ? "it counts." : "the budget changes."
    }${record}`,
  };
}

function fmt(hours: number): string {
  return String(Math.round(hours * 10) / 10);
}
