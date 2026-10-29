import { describe, expect, it } from "vitest";
import { approvalBlockers, hoursGrid } from "./review-view";

const row = (employeeId: string, name: string, hours: number, flagged = false) => ({
  employeeId,
  name,
  hours,
  flagged,
  dayTotalAllJobs: hours,
});

describe("hours grid", () => {
  const grid = hoursGrid([
    // Newest first, as the work order screen lists them.
    { date: "2026-11-03", rows: [row("d", "Delta", 5, true)] },
    { date: "2026-11-02", rows: [row("c", "Charlie", 8), row("d", "Delta", 7.5), row("a", "Alpha", 8)] },
  ]);

  it("puts days oldest first and people by name", () => {
    expect(grid.days).toEqual(["2026-11-02", "2026-11-03"]);
    expect(grid.people.map((p) => p.name)).toEqual(["Alpha", "Charlie", "Delta"]);
  });

  it("totals each person, each day, and the job", () => {
    expect(grid.people.find((p) => p.name === "Delta")?.total).toBe(12.5);
    expect(grid.dayTotals.get("2026-11-02")).toBe(23.5);
    expect(grid.dayTotals.get("2026-11-03")).toBe(5);
    expect(grid.total).toBe(28.5);
  });

  it("leaves days with no hours empty and counts flagged cells", () => {
    expect(grid.people.find((p) => p.name === "Alpha")?.cells.has("2026-11-03")).toBe(false);
    expect(grid.flaggedCount).toBe(1);
  });

  it("is empty when there are no hours", () => {
    expect(hoursGrid([])).toMatchObject({ days: [], people: [], total: 0, flaggedCount: 0 });
  });
});

describe("what blocks approval", () => {
  it("nothing when change orders are decided and no hours are flagged", () => {
    expect(approvalBlockers({ pendingChangeOrders: 0, needsReviewEntries: 0 })).toEqual([]);
  });

  it("change orders waiting for the owner, and hours flagged for review", () => {
    expect(approvalBlockers({ pendingChangeOrders: 1, needsReviewEntries: 2 })).toHaveLength(2);
    expect(approvalBlockers({ pendingChangeOrders: 2, needsReviewEntries: 0 })[0]).toMatch(/2 change orders/);
  });
});
