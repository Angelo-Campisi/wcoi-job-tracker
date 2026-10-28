// Labor cost (spec 5): sum of entry hours × the employee's wage in effect on the entry date.
// Owner and bookkeeper only. Never send these results to a job lead's screen.
//
// Money is kept in whole cents. Overtime is out of scope for now, but every cost
// goes through `costEntries`, which receives all entries at once, so an overtime rule
// (which needs a whole week of an employee's hours) can be added there later.
import type { TimeEntry, Wage } from "./types";

/** The wage in effect on `date`: the latest one that started on or before that day. */
export function wageOn(wages: Wage[], employeeId: string, date: string): Wage | null {
  let best: Wage | null = null;
  for (const w of wages) {
    if (w.employeeId !== employeeId || w.effectiveFrom > date) continue;
    if (!best || w.effectiveFrom > best.effectiveFrom) best = w;
  }
  return best;
}

export interface EntryCost {
  entryId: string;
  hourlyWage: number;
  costCents: number;
}

export interface LaborCostResult {
  totalCents: number;
  entries: EntryCost[];
  /** Entries with no wage on file for that date. They are left out of the total, never guessed. */
  missingWage: TimeEntry[];
}

export function costEntries(entries: TimeEntry[], wages: Wage[]): LaborCostResult {
  const costed: EntryCost[] = [];
  const missingWage: TimeEntry[] = [];
  for (const e of entries) {
    const wage = wageOn(wages, e.employeeId, e.date);
    if (!wage) {
      missingWage.push(e);
      continue;
    }
    // Hours in hundredths × wage in cents, divided back down and rounded to the cent.
    const costCents = Math.round((Math.round(e.hours * 100) * Math.round(wage.hourlyWage * 100)) / 100);
    costed.push({ entryId: e.id, hourlyWage: wage.hourlyWage, costCents });
  }
  return {
    totalCents: costed.reduce((t, c) => t + c.costCents, 0),
    entries: costed,
    missingWage,
  };
}

export function laborCost(entries: TimeEntry[], wages: Wage[], workOrderId: string): LaborCostResult {
  return costEntries(entries.filter((e) => e.workOrderId === workOrderId), wages);
}

export function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
