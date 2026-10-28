import { describe, expect, it } from "vitest";
import type { TimeEntry } from "./types";
import { hoursByDay, statusSteps, telHref } from "./work-order-view";

describe("tap-to-call", () => {
  it("dials US numbers with the country code", () => {
    expect(telHref("(402) 555-0101")).toBe("tel:+14025550101");
    expect(telHref("1-402-555-0101")).toBe("tel:+14025550101");
  });

  it("keeps short numbers as typed", () => {
    expect(telHref("555-0101")).toBe("tel:5550101");
  });

  it("has nothing to dial when there is no number", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("n/a")).toBeNull();
  });
});

describe("status steps", () => {
  it("marks earlier steps done and the current one", () => {
    expect(statusSteps("turned_in").map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(statusSteps("open")[0]).toEqual({ label: "Open", state: "current" });
    expect(statusSteps("sent").map((s) => s.state)).toEqual(["done", "done", "done", "current"]);
  });
});

describe("hours by day", () => {
  const entry = (id: string, employeeId: string, date: string, hours: number, workOrderId = "wo-1"): TimeEntry => ({
    id,
    workOrderId,
    employeeId,
    date,
    hours,
    enteredByUserId: "u",
  });
  const names = new Map([
    ["e1", "Alpha"],
    ["e2", "Bravo"],
  ]);
  const entries = [
    entry("1", "e2", "2026-11-02", 8),
    entry("2", "e1", "2026-11-02", 7.5),
    entry("3", "e1", "2026-11-03", 5),
    entry("4", "e1", "2026-11-03", 4, "wo-other"),
  ];

  it("lists newest day first, names in order, with day totals", () => {
    const days = hoursByDay(entries, "wo-1", names, new Map(), 8);
    expect(days.map((d) => [d.date, d.total])).toEqual([
      ["2026-11-03", 5],
      ["2026-11-02", 15.5],
    ]);
    expect(days[1].rows.map((r) => r.name)).toEqual(["Alpha", "Bravo"]);
  });

  it("flags a day over the limit across all jobs, not at exactly the limit", () => {
    const totals = new Map([
      ["e1|2026-11-03", 9],
      ["e2|2026-11-02", 8],
    ]);
    const days = hoursByDay(entries, "wo-1", names, totals, 8);
    expect(days[0].rows[0]).toMatchObject({ name: "Alpha", hours: 5, dayTotalAllJobs: 9, flagged: true });
    expect(days[1].rows.find((r) => r.name === "Bravo")?.flagged).toBe(false);
  });
});
