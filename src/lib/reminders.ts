// Budget reminders for quoted jobs (spec 6.4, decision 4).
//
// - Each level (default 50% and 80%) fires once when usage first reaches it.
// - "over" fires once when usage goes above 100%.
// - If usage drops back below a level (for example, an approved change order
//   raises the budget), that level re-arms and can fire again later.
// The caller stores `firedLevels` on the work order between checks.
import { reachedPercent } from "./budget";
import type { JobType } from "./types";

export type ReminderLevel = number | "over";

export interface ReminderCheck {
  /** Levels to notify about now (email + in-app badge to owner and bookkeeper). */
  fire: ReminderLevel[];
  /** Levels to store as already fired. */
  firedLevels: ReminderLevel[];
}

export function checkReminders(
  jobType: JobType,
  hoursUsed: number,
  budgetHours: number,
  levels: number[],
  firedLevels: ReminderLevel[],
): ReminderCheck {
  // Hourly jobs, or quoted jobs with no budget yet, get no budget alerts.
  if (jobType === "hourly" || budgetHours <= 0) return { fire: [], firedLevels: [] };

  const reached: ReminderLevel[] = [...levels]
    .sort((a, b) => a - b)
    .filter((p) => reachedPercent(hoursUsed, budgetHours, p));
  if (Math.round(hoursUsed * 100) > Math.round(budgetHours * 100)) reached.push("over");

  return {
    fire: reached.filter((l) => !firedLevels.includes(l)),
    // Keep only levels still reached; anything else re-arms.
    firedLevels: reached,
  };
}
