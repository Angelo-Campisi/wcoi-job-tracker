// Hours math: validation, totals, daily flags, and summaries (spec 5, 6.3, 6.12).
import { weekStart } from "./dates";
import type { TimeEntry } from "./types";

/**
 * Adds hours without floating-point drift (0.1 + 0.2 must equal 0.3).
 * Hours are summed in hundredths of an hour.
 */
export function sumHours(values: number[]): number {
  return values.reduce((total, h) => total + Math.round(h * 100), 0) / 100;
}

/** Returns a problem message, or null when the hours value is acceptable. */
export function validateHours(hours: number): string | null {
  if (!Number.isFinite(hours)) return "Hours must be a number.";
  if (hours <= 0) return "Hours must be more than 0.";
  if (hours > 24) return "Hours cannot be more than 24 in one day.";
  // Half-hour steps only (owner decision): 2, 2.5, 3, ...
  if (!Number.isInteger(hours * 2)) return "Use half-hour steps, like 2, 2.5, or 3.";
  return null;
}

/** Hours used = sum of time entries for the work order. */
export function hoursUsed(entries: TimeEntry[], workOrderId: string): number {
  return sumHours(entries.filter((e) => e.workOrderId === workOrderId).map((e) => e.hours));
}

/** Groups entries by a key and sums hours per group, in first-seen order. */
function totalBy(entries: TimeEntry[], key: (e: TimeEntry) => string): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const e of entries) {
    const k = key(e);
    const list = groups.get(k);
    if (list) list.push(e.hours);
    else groups.set(k, [e.hours]);
  }
  return new Map([...groups].map(([k, hours]) => [k, sumHours(hours)]));
}

export interface EmployeeDayTotal {
  employeeId: string;
  date: string;
  hours: number;
}

/** Each employee's total hours per day, across all jobs. */
export function dailyTotals(entries: TimeEntry[]): EmployeeDayTotal[] {
  const totals = totalBy(entries, (e) => `${e.employeeId}|${e.date}`);
  return [...totals].map(([k, hours]) => {
    const [employeeId, date] = k.split("|");
    return { employeeId, date, hours };
  });
}

/**
 * Daily hours flag (spec 6.3, assumption 7): per employee, per day, across all jobs.
 * Flags only totals strictly above the threshold, so exactly 8 hours is not flagged.
 * This is a soft warning; it never blocks saving.
 */
export function overThresholdDays(entries: TimeEntry[], threshold: number): EmployeeDayTotal[] {
  return dailyTotals(entries).filter((t) => t.hours > threshold);
}

/**
 * Checks a new or edited entry before saving. Returns the employee's day total
 * including this entry, and whether it goes over the threshold.
 * `existing` should include the employee's other entries for that day (any job);
 * an entry with the same id is treated as being replaced.
 */
export function checkDailyFlag(
  existing: TimeEntry[],
  entry: TimeEntry,
  threshold: number,
): { dayTotal: number; overThreshold: boolean } {
  const sameDay = existing.filter(
    (e) => e.employeeId === entry.employeeId && e.date === entry.date && e.id !== entry.id,
  );
  const dayTotal = sumHours([...sameDay.map((e) => e.hours), entry.hours]);
  return { dayTotal, overThreshold: dayTotal > threshold };
}

export interface EmployeeWeekTotal {
  employeeId: string;
  weekStart: string;
  hours: number;
}

/** Each employee's total hours per Monday–Sunday week, across all jobs (for payroll). */
export function weeklyTotals(entries: TimeEntry[]): EmployeeWeekTotal[] {
  const totals = totalBy(entries, (e) => `${e.employeeId}|${weekStart(e.date)}`);
  return [...totals].map(([k, hours]) => {
    const [employeeId, week] = k.split("|");
    return { employeeId, weekStart: week, hours };
  });
}

export interface WorkOrderHoursSummary {
  workOrderId: string;
  totalHours: number;
  byEmployee: { employeeId: string; hours: number }[];
  byDay: { date: string; hours: number }[];
  /** Daily job sheet rows: each employee's hours on each day. */
  byEmployeeAndDay: { employeeId: string; date: string; hours: number }[];
}

/** Per-work-order summary used by the daily job sheet and bookkeeper review (6.5, 6.12). */
export function workOrderSummary(entries: TimeEntry[], workOrderId: string): WorkOrderHoursSummary {
  const mine = entries.filter((e) => e.workOrderId === workOrderId);
  const byEmployee = [...totalBy(mine, (e) => e.employeeId)].map(([employeeId, hours]) => ({
    employeeId,
    hours,
  }));
  const byDay = [...totalBy(mine, (e) => e.date)]
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byEmployeeAndDay = dailyTotals(mine).sort(
    (a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId),
  );
  return {
    workOrderId,
    totalHours: sumHours(mine.map((e) => e.hours)),
    byEmployee,
    byDay,
    byEmployeeAndDay,
  };
}
