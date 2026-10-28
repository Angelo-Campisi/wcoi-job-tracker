import { describe, expect, it } from "vitest";
import { timeEntries, wages } from "@/dev/fake-data";
import { costEntries, formatDollars, laborCost, wageOn } from "./labor-cost";
import type { TimeEntry, Wage } from "./types";

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "x",
  workOrderId: "wo-1",
  employeeId: "emp-1",
  date: "2026-11-02",
  hours: 1,
  enteredByUserId: "u",
  ...over,
});

describe("wage in effect on a date", () => {
  it("uses the old wage before a raise and the new wage from the raise date", () => {
    expect(wageOn(wages, "emp-3", "2026-11-03")?.hourlyWage).toBe(22);
    expect(wageOn(wages, "emp-3", "2026-11-04")?.hourlyWage).toBe(24);
    expect(wageOn(wages, "emp-3", "2027-06-01")?.hourlyWage).toBe(24);
  });
  it("does not depend on the order wages were entered", () => {
    expect(wageOn([...wages].reverse(), "emp-3", "2026-11-05")?.hourlyWage).toBe(24);
  });
  it("returns nothing before the first wage", () => {
    expect(wageOn(wages, "emp-3", "2025-12-31")).toBeNull();
  });
});

describe("labor cost", () => {
  it("prices a mid-job raise correctly (fake job wo-1001)", () => {
    // emp-1 8h×$30=240, emp-3 8h×$22=176, emp-4 7.5h×$21=157.50,
    // emp-4 5h×$21=105, emp-3 8h×$24 after the raise=192 → $870.50
    const result = laborCost(timeEntries, wages, "wo-1001");
    expect(result.totalCents).toBe(87050);
    expect(result.missingWage).toEqual([]);
  });

  it("a raise does not change the cost of past entries", () => {
    const before = laborCost(timeEntries, wages, "wo-1001").totalCents;
    const withLaterRaise: Wage[] = [...wages, { employeeId: "emp-1", hourlyWage: 99, effectiveFrom: "2027-01-01" }];
    expect(laborCost(timeEntries, withLaterRaise, "wo-1001").totalCents).toBe(before);
  });

  it("rounds to the cent", () => {
    const w: Wage[] = [{ employeeId: "emp-1", hourlyWage: 21.37, effectiveFrom: "2026-01-01" }];
    // 7.5 × 21.37 = 160.275 → $160.28
    expect(costEntries([entry({ hours: 7.5 })], w).totalCents).toBe(16028);
  });

  it("lists entries with no wage on file instead of guessing", () => {
    const result = costEntries([entry({ employeeId: "emp-unknown", hours: 5 }), entry({ id: "y", hours: 2 })], wages);
    expect(result.totalCents).toBe(6000);
    expect(result.missingWage.map((e) => e.employeeId)).toEqual(["emp-unknown"]);
  });

  it("formats dollars", () => {
    expect(formatDollars(87050)).toBe("$870.50");
  });
});
