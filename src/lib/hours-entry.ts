// Hours entry rules (spec 6.3) that don't need the database, so they can be tested.
// One entry per employee, per job, per day. Hours only, in half-hour steps.
import { addDays, weekStart } from "./dates";
import { sumHours, validateHours } from "./hours";

/** What a full day starts at when the lead first taps "+". */
export const FULL_DAY_HOURS = 8;

/**
 * The +/- buttons. "+" on an empty row starts at a full day (8), then goes up by
 * half an hour. "-" goes down by half an hour; below 0.5 the row is empty again.
 */
export function stepHours(current: number | null, direction: 1 | -1): number | null {
  if (current === null) return direction === 1 ? FULL_DAY_HOURS : null;
  const next = sumHours([current, direction * 0.5]);
  if (next <= 0) return null;
  return Math.min(next, 24);
}

export type HoursByEmployee = Map<string, number>;

/** Saves and deletes needed to go from the saved hours to the edited hours for one day. */
export function hoursChanges(
  saved: HoursByEmployee,
  edited: Map<string, number | null>,
): { upserts: { employeeId: string; hours: number }[]; deletes: string[] } {
  const upserts: { employeeId: string; hours: number }[] = [];
  const deletes: string[] = [];
  for (const [employeeId, hours] of edited) {
    const before = saved.get(employeeId) ?? null;
    if (hours === null) {
      if (before !== null) deletes.push(employeeId);
    } else if (hours !== before) {
      upserts.push({ employeeId, hours });
    }
  }
  return { upserts, deletes };
}

/** Problems with the edited hours, by employee. Empty when all are fine. */
export function hoursProblems(edited: Map<string, number | null>): Map<string, string> {
  const problems = new Map<string, string>();
  for (const [employeeId, hours] of edited) {
    if (hours === null) continue;
    const problem = validateHours(hours);
    if (problem) problems.set(employeeId, problem);
  }
  return problems;
}

export interface DailyFlag {
  employeeId: string;
  /** Total for the day across all jobs, including the new hours on this job. */
  dayTotal: number;
}

/**
 * Daily hours flag (spec 6.3): an employee whose total for the day across all jobs
 * goes ABOVE the threshold. `allJobsDay` is what's saved across all jobs for that day
 * (including this job's saved hours, which are swapped for the edited hours).
 * A soft warning only; the lead can confirm and save.
 */
export function dailyFlags(
  edited: Map<string, number | null>,
  savedThisJob: HoursByEmployee,
  allJobsDay: HoursByEmployee,
  threshold: number,
): DailyFlag[] {
  const flags: DailyFlag[] = [];
  for (const [employeeId, hours] of edited) {
    if (hours === null) continue;
    const otherJobs = sumHours([allJobsDay.get(employeeId) ?? 0, -(savedThisJob.get(employeeId) ?? 0)]);
    const dayTotal = sumHours([Math.max(otherJobs, 0), hours]);
    if (dayTotal > threshold) flags.push({ employeeId, dayTotal });
  }
  return flags;
}

/** The Monday–Sunday week containing `date` (weeks used for payroll, decision 6). */
export function weekOf(date: string): { start: string; end: string } {
  const start = weekStart(date);
  return { start, end: addDays(start, 6) };
}
