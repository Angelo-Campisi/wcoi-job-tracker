// "My jobs" list logic (spec 6.1): today's jobs first, then upcoming, then past.
// Dates are "YYYY-MM-DD" calendar days.
import type { BudgetStatus } from "./budget";

export interface ScheduledJob {
  id: string;
  /** Days this job is scheduled (for a lead: only the days they lead it). */
  dates: string[];
}

export interface JobGroups<T extends ScheduledJob> {
  today: T[];
  upcoming: T[];
  past: T[];
  /** No dates set yet. */
  unscheduled: T[];
}

/**
 * Sorts jobs into Today / Upcoming / Past / Not scheduled.
 * Upcoming: soonest next day first. Past: most recent day first.
 * A job running today counts as today even if it also has later days.
 */
export function groupJobs<T extends ScheduledJob>(jobs: T[], today: string): JobGroups<T> {
  const groups: JobGroups<T> = { today: [], upcoming: [], past: [], unscheduled: [] };
  for (const job of jobs) {
    if (job.dates.length === 0) groups.unscheduled.push(job);
    else if (job.dates.includes(today)) groups.today.push(job);
    else if (job.dates.some((d) => d > today)) groups.upcoming.push(job);
    else groups.past.push(job);
  }
  const nextDate = (job: T) => job.dates.filter((d) => d > today).sort()[0];
  const lastDate = (job: T) => [...job.dates].sort().at(-1)!;
  groups.upcoming.sort((a, b) => nextDate(a).localeCompare(nextDate(b)) || a.id.localeCompare(b.id));
  groups.past.sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || a.id.localeCompare(b.id));
  return groups;
}

/** Today's calendar date in the company's time zone, e.g. "2026-11-02". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "Mon, Nov 2" — short and readable on a job card. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Which scheduled days to show on a card: the days from today on, or for a
 * past job its last days. Long runs are cut short with a count of the rest.
 */
export function datesSummary(dates: string[], today: string, max = 3): string {
  const sorted = [...dates].sort();
  const coming = sorted.filter((d) => d >= today);
  const shown = coming.length > 0 ? coming : sorted.slice(-max);
  const labels = shown.slice(0, max).map(shortDate);
  const more = shown.length - labels.length;
  return more > 0 ? `${labels.join(" · ")} +${more} more` : labels.join(" · ");
}

/** Hours with at most one decimal and no trailing ".0": 7.5, 8. */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 10) / 10);
}

export type BudgetTone = "good" | "warn" | "bad";

/** Plain words and a color tone for each budget status. Never color alone. */
export function budgetStatusLabel(status: BudgetStatus): { label: string; tone: BudgetTone } {
  switch (status) {
    case "under_50":
      return { label: "On track", tone: "good" };
    case "at_50":
      return { label: "Half used", tone: "good" };
    case "at_80":
      return { label: "80% used", tone: "warn" };
    case "at_100":
      return { label: "At budget", tone: "warn" };
    case "over":
      return { label: "Over budget", tone: "bad" };
  }
}

export const WORK_ORDER_STATUS_LABELS = {
  open: "Open",
  turned_in: "Turned in",
  approved: "Approved",
  sent: "Sent to QuickBooks",
} as const;
