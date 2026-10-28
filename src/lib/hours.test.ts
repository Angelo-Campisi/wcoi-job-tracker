import { describe, expect, it } from "vitest";
import { timeEntries } from "@/dev/fake-data";
import {
  checkDailyFlag,
  dailyTotals,
  hoursUsed,
  overThresholdDays,
  sumHours,
  validateHours,
  weeklyTotals,
  workOrderSummary,
} from "./hours";
import type { TimeEntry } from "./types";

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "x",
  workOrderId: "wo-1",
  employeeId: "emp-1",
  date: "2026-11-02",
  hours: 1,
  enteredByUserId: "user-1",
  ...over,
});

describe("sumHours", () => {
  it("adds decimals exactly", () => {
    expect(sumHours([0.1, 0.2])).toBe(0.3);
    expect(sumHours([7.25, 0.75, 0.33])).toBe(8.33);
    expect(sumHours([])).toBe(0);
  });
});

describe("validateHours", () => {
  it("accepts normal values", () => {
    for (const h of [0.5, 2, 2.5, 7.5, 8, 10.5, 24]) expect(validateHours(h)).toBeNull();
  });
  it("rejects zero, negative, over 24, non-half-hour steps, and non-numbers", () => {
    for (const h of [0, -1, -0.5, 24.5, 0.25, 7.75, 7.1, 1.234, Number.NaN, Infinity]) expect(validateHours(h)).not.toBeNull();
  });
});

describe("hours used on a job", () => {
  it("sums only that job's entries", () => {
    expect(hoursUsed(timeEntries, "wo-1001")).toBe(36.5);
    expect(hoursUsed(timeEntries, "wo-1002")).toBe(12);
    expect(hoursUsed(timeEntries, "wo-none")).toBe(0);
  });
});

describe("daily totals and the daily hours flag", () => {
  it("totals one employee's day across all jobs", () => {
    const day = dailyTotals(timeEntries).find((t) => t.employeeId === "emp-4" && t.date === "2026-11-03");
    expect(day?.hours).toBe(9);
  });

  it("flags only the employee who went over 8 across two jobs", () => {
    expect(overThresholdDays(timeEntries, 8)).toEqual([
      { employeeId: "emp-4", date: "2026-11-03", hours: 9 },
    ]);
  });

  it("does not flag exactly the threshold", () => {
    expect(overThresholdDays([entry({ hours: 8 })], 8)).toEqual([]);
  });

  it("uses the owner's threshold", () => {
    expect(overThresholdDays(timeEntries, 9)).toEqual([]);
    expect(overThresholdDays(timeEntries, 7.5).map((t) => t.employeeId)).toContain("emp-1");
  });

  it("warns before saving a new entry that pushes the day over", () => {
    const newEntry = entry({ id: "new", employeeId: "emp-4", date: "2026-11-03", hours: 1 });
    expect(checkDailyFlag(timeEntries, newEntry, 8)).toEqual({ dayTotal: 10, overThreshold: true });
  });

  it("treats an edit as replacing the old value, not adding to it", () => {
    // te-5 was 4 hours; editing it to 3 makes the day 5 + 3 = 8, not flagged.
    const edit = { ...timeEntries.find((e) => e.id === "te-5")!, hours: 3 };
    expect(checkDailyFlag(timeEntries, edit, 8)).toEqual({ dayTotal: 8, overThreshold: false });
  });
});

describe("weekly totals for payroll", () => {
  it("adds an employee's hours across jobs and days in the same week", () => {
    const emp4 = weeklyTotals(timeEntries).filter((t) => t.employeeId === "emp-4");
    expect(emp4).toEqual([{ employeeId: "emp-4", weekStart: "2026-11-02", hours: 16.5 }]);
  });

  it("splits Sunday and Monday into different weeks", () => {
    const totals = weeklyTotals([
      entry({ id: "a", date: "2026-11-08", hours: 5 }),
      entry({ id: "b", date: "2026-11-09", hours: 6 }),
    ]);
    expect(totals).toEqual([
      { employeeId: "emp-1", weekStart: "2026-11-02", hours: 5 },
      { employeeId: "emp-1", weekStart: "2026-11-09", hours: 6 },
    ]);
  });
});

describe("work order summary (daily job sheet and bookkeeper review)", () => {
  it("breaks hours down by employee and by day, and totals match", () => {
    const s = workOrderSummary(timeEntries, "wo-1001");
    expect(s.totalHours).toBe(36.5);
    expect(s.byEmployee).toEqual([
      { employeeId: "emp-1", hours: 8 },
      { employeeId: "emp-3", hours: 16 },
      { employeeId: "emp-4", hours: 12.5 },
    ]);
    expect(s.byDay).toEqual([
      { date: "2026-11-02", hours: 23.5 },
      { date: "2026-11-03", hours: 5 },
      { date: "2026-11-04", hours: 8 },
    ]);
    expect(sumHours(s.byEmployee.map((r) => r.hours))).toBe(s.totalHours);
    expect(sumHours(s.byDay.map((r) => r.hours))).toBe(s.totalHours);
    expect(sumHours(s.byEmployeeAndDay.map((r) => r.hours))).toBe(s.totalHours);
  });

  it("does not include another job's hours for the same employee", () => {
    const s = workOrderSummary(timeEntries, "wo-1003");
    expect(s.byEmployee).toEqual([{ employeeId: "emp-4", hours: 4 }]);
  });
});
