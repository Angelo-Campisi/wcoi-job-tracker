// Bookkeeper review (spec 6.5): one grid of hours, people down the side and days
// across, with totals both ways. Replaces comparing the daily sheets by hand.
import { sumHours } from "./hours";

export interface GridDayInput {
  date: string;
  rows: { employeeId: string; name: string; hours: number; flagged: boolean; dayTotalAllJobs: number }[];
}

export interface HoursGrid {
  /** Oldest day first. */
  days: string[];
  people: {
    employeeId: string;
    name: string;
    /** Hours by date; missing means no hours that day. */
    cells: Map<string, { hours: number; flagged: boolean; dayTotalAllJobs: number }>;
    total: number;
  }[];
  dayTotals: Map<string, number>;
  total: number;
  /** Cells over the daily limit across all jobs. */
  flaggedCount: number;
}

export function hoursGrid(input: GridDayInput[]): HoursGrid {
  const days = input.map((d) => d.date).sort();
  const people = new Map<string, HoursGrid["people"][number]>();
  const dayTotals = new Map<string, number>();
  let flaggedCount = 0;

  for (const day of input) {
    dayTotals.set(day.date, sumHours(day.rows.map((r) => r.hours)));
    for (const row of day.rows) {
      if (!people.has(row.employeeId)) {
        people.set(row.employeeId, { employeeId: row.employeeId, name: row.name, cells: new Map(), total: 0 });
      }
      const person = people.get(row.employeeId)!;
      person.cells.set(day.date, { hours: row.hours, flagged: row.flagged, dayTotalAllJobs: row.dayTotalAllJobs });
      person.total = sumHours([person.total, row.hours]);
      if (row.flagged) flaggedCount += 1;
    }
  }

  return {
    days,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    dayTotals,
    total: sumHours([...dayTotals.values()]),
    flaggedCount,
  };
}

export interface ReviewBlockers {
  pendingChangeOrders: number;
  needsReviewEntries: number;
}

/** Why a job can't be approved yet (same rules as the database), or [] when it can. */
export function approvalBlockers(b: ReviewBlockers): string[] {
  const reasons: string[] = [];
  if (b.pendingChangeOrders > 0) {
    reasons.push(
      b.pendingChangeOrders === 1
        ? "A change order is still waiting for the owner. Approve or deny it first."
        : `${b.pendingChangeOrders} change orders are still waiting for the owner. Approve or deny them first.`,
    );
  }
  if (b.needsReviewEntries > 0) reasons.push("Some hours are flagged for review. Check them first.");
  return reasons;
}
