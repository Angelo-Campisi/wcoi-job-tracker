import { describe, expect, it } from "vitest";
import { dailyFlags, hoursChanges, hoursProblems, stepHours, weekOf } from "./hours-entry";

describe("+/- buttons", () => {
  it("+ on an empty row starts at a full day", () => {
    expect(stepHours(null, 1)).toBe(8);
  });

  it("moves in half-hour steps", () => {
    expect(stepHours(8, 1)).toBe(8.5);
    expect(stepHours(8, -1)).toBe(7.5);
  });

  it("goes back to empty below half an hour, and stays empty", () => {
    expect(stepHours(0.5, -1)).toBeNull();
    expect(stepHours(null, -1)).toBeNull();
  });

  it("never goes above 24", () => {
    expect(stepHours(24, 1)).toBe(24);
  });
});

describe("what to save", () => {
  const saved = new Map([
    ["a", 8],
    ["b", 7.5],
  ]);

  it("saves new and changed hours, deletes cleared ones, skips unchanged", () => {
    const edited = new Map<string, number | null>([
      ["a", 8],
      ["b", null],
      ["c", 6],
    ]);
    expect(hoursChanges(saved, edited)).toEqual({ upserts: [{ employeeId: "c", hours: 6 }], deletes: ["b"] });
  });

  it("does nothing when nothing changed", () => {
    expect(hoursChanges(saved, new Map([["a", 8], ["b", 7.5]]))).toEqual({ upserts: [], deletes: [] });
  });

  it("an empty row that was never saved is not deleted", () => {
    expect(hoursChanges(saved, new Map([["z", null]]))).toEqual({ upserts: [], deletes: [] });
  });
});

describe("checking hours", () => {
  it("finds hours that break the rules", () => {
    const problems = hoursProblems(new Map<string, number | null>([["a", 2.25], ["b", 8], ["c", null]]));
    expect([...problems.keys()]).toEqual(["a"]);
  });
});

describe("daily hours flag", () => {
  it("adds other jobs' hours to the new hours, replacing this job's saved hours", () => {
    // Saved: 5h here + 4h elsewhere = 9 across all jobs. Changing here to 4h makes 8: not flagged.
    const savedHere = new Map([["d", 5]]);
    const allJobs = new Map([["d", 9]]);
    expect(dailyFlags(new Map([["d", 4]]), savedHere, allJobs, 8)).toEqual([]);
    expect(dailyFlags(new Map([["d", 4.5]]), savedHere, allJobs, 8)).toEqual([{ employeeId: "d", dayTotal: 8.5 }]);
  });

  it("flags only above the limit, never at exactly the limit", () => {
    expect(dailyFlags(new Map([["a", 8]]), new Map(), new Map(), 8)).toEqual([]);
    expect(dailyFlags(new Map([["a", 8.5]]), new Map(), new Map(), 8)).toHaveLength(1);
  });

  it("ignores cleared rows", () => {
    expect(dailyFlags(new Map([["a", null]]), new Map(), new Map([["a", 12]]), 8)).toEqual([]);
  });
});

describe("payroll week", () => {
  it("runs Monday to Sunday", () => {
    expect(weekOf("2026-11-04")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(weekOf("2026-11-08")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
});
