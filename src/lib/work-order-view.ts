// Display helpers for the work order screen (spec 6.2). No database access here.
import { workOrderSummary } from "./hours";
import type { TimeEntry, WorkOrderStatus } from "./types";

/**
 * A tap-to-call link for a US phone number, or null when there is nothing to dial.
 * "555-0101" stays as typed; "(402) 555-0101" becomes "tel:+14025550101".
 */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits}`;
}

export type StepState = "done" | "current" | "todo";

const STEPS: { status: WorkOrderStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "turned_in", label: "Turned in" },
  { status: "approved", label: "Approved" },
  { status: "sent", label: "Sent" },
];

/** The four stages a job moves through (spec 6.6), marked done / current / to do. */
export function statusSteps(status: WorkOrderStatus): { label: string; state: StepState }[] {
  const current = STEPS.findIndex((s) => s.status === status);
  return STEPS.map((s, i) => ({
    label: s.label,
    state: i < current ? "done" : i === current ? "current" : "todo",
  }));
}

export interface HoursDay {
  date: string;
  total: number;
  rows: { employeeId: string; name: string; hours: number; dayTotalAllJobs: number; flagged: boolean }[];
}

/**
 * Hours on this job by day, newest day first, each employee by name.
 * `dayTotalsAllJobs` maps "employeeId|date" to that employee's hours across ALL jobs
 * that day; above `threshold` is flagged (soft warning, spec 6.3). Missing totals
 * fall back to the hours on this job.
 */
export function hoursByDay(
  entries: TimeEntry[],
  workOrderId: string,
  names: Map<string, string>,
  dayTotalsAllJobs: Map<string, number>,
  threshold: number,
): HoursDay[] {
  const summary = workOrderSummary(entries, workOrderId);
  return summary.byDay
    .map(({ date, hours }) => ({
      date,
      total: hours,
      rows: summary.byEmployeeAndDay
        .filter((r) => r.date === date)
        .map((r) => {
          const dayTotalAllJobs = Math.max(dayTotalsAllJobs.get(`${r.employeeId}|${date}`) ?? 0, r.hours);
          return {
            employeeId: r.employeeId,
            name: names.get(r.employeeId) ?? "Unknown employee",
            hours: r.hours,
            dayTotalAllJobs,
            flagged: dayTotalAllJobs > threshold,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .reverse();
}
