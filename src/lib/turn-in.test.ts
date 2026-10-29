import { describe, expect, it } from "vitest";
import { totalsByPerson, turnInProblem, turnInWarnings } from "./turn-in";

describe("what turn-in needs", () => {
  it("a signature and the signer's name", () => {
    expect(turnInProblem({ mode: "signed", signedName: "Sam", hasInk: false })).toMatch(/sign in the box/);
    expect(turnInProblem({ mode: "signed", signedName: "  ", hasInk: true })).toMatch(/name of the person/);
    expect(turnInProblem({ mode: "signed", signedName: "Sam", hasInk: true })).toBeNull();
  });

  it("or a reason the customer can't sign", () => {
    expect(turnInProblem({ mode: "no-signature", reason: " " })).toMatch(/why the customer/);
    expect(turnInProblem({ mode: "no-signature", reason: "x".repeat(501) })).toMatch(/under 500/);
    expect(turnInProblem({ mode: "no-signature", reason: "Customer left at noon" })).toBeNull();
  });
});

describe("warnings before turn-in", () => {
  it("none when there are hours today and nothing waiting", () => {
    expect(turnInWarnings({ hoursTotal: 20, hasHoursToday: true, pendingChangeOrders: 0 })).toEqual([]);
  });

  it("warns about no hours at all, or none today", () => {
    expect(turnInWarnings({ hoursTotal: 0, hasHoursToday: false, pendingChangeOrders: 0 })).toEqual([
      "No hours have been entered on this job.",
    ]);
    expect(turnInWarnings({ hoursTotal: 20, hasHoursToday: false, pendingChangeOrders: 0 })[0]).toMatch(/for today/);
  });

  it("warns about change orders still waiting for the owner", () => {
    expect(turnInWarnings({ hoursTotal: 20, hasHoursToday: true, pendingChangeOrders: 2 })[0]).toMatch(/2 change orders/);
  });
});

describe("hours by person for the customer", () => {
  it("adds up each person's days, largest first", () => {
    const days = [
      { rows: [{ name: "Charlie", hours: 8 }, { name: "Delta", hours: 5 }] },
      { rows: [{ name: "Charlie", hours: 8 }, { name: "Delta", hours: 7.5 }, { name: "Alpha", hours: 8 }] },
    ];
    expect(totalsByPerson(days)).toEqual([
      { name: "Charlie", hours: 16 },
      { name: "Delta", hours: 12.5 },
      { name: "Alpha", hours: 8 },
    ]);
  });
});
