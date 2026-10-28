import { describe, expect, it } from "vitest";
import { changeOrders, workOrders } from "@/dev/fake-data";
import {
  approvedChangeOrderHours,
  budgetView,
  changeOrderType,
  jobType,
  originalBudgetHours,
} from "./budget";
import type { ChangeOrder, WorkOrderLine } from "./types";

const wo = (id: string) => workOrders.find((w) => w.id === id)!;
const labor = (quantity: number): WorkOrderLine => ({ description: "Labor", quantity, isLabor: true });
const fuel: WorkOrderLine = { description: "Fuel surcharge", quantity: 1, isLabor: false };
const co = (over: Partial<ChangeOrder>): ChangeOrder => ({
  id: "c",
  workOrderId: "wo-x",
  type: "quick",
  hoursAdded: 1,
  description: "",
  requestedByUserId: "u",
  status: "approved",
  approvedByUserId: null,
  ...over,
});

describe("original budget hours", () => {
  it("sums labor lines and ignores the fuel surcharge", () => {
    expect(originalBudgetHours(wo("wo-1001").lines)).toBe(32);
    expect(originalBudgetHours([labor(5.5), fuel])).toBe(5.5);
  });
});

describe("job type (decision 1)", () => {
  it("is quoted when labor lines have hours", () => {
    expect(jobType(wo("wo-1001"))).toBe("quoted");
  });
  it("is hourly when labor lines have no hours, even with a fuel surcharge", () => {
    expect(jobType(wo("wo-1002"))).toBe("hourly");
    expect(jobType({ lines: [fuel] })).toBe("hourly");
  });
  it("follows the bookkeeper's override", () => {
    expect(jobType({ lines: [labor(10)], jobTypeOverride: "hourly" })).toBe("hourly");
    expect(jobType({ lines: [fuel], jobTypeOverride: "quoted" })).toBe("quoted");
  });
});

describe("change orders", () => {
  it("are quick at or below the threshold and large above it", () => {
    expect(changeOrderType(4, 4)).toBe("quick");
    expect(changeOrderType(4.25, 4)).toBe("large");
  });

  it("only count once approved", () => {
    expect(approvedChangeOrderHours(changeOrders, "wo-1001")).toBe(2); // large one is pending
    const list = [
      co({ hoursAdded: 2 }),
      co({ type: "large", hoursAdded: 10, status: "pending" }),
      co({ type: "large", hoursAdded: 6, status: "denied" }),
      co({ type: "large", hoursAdded: 5, status: "approved" }),
      co({ workOrderId: "other", hoursAdded: 50 }),
    ];
    expect(approvedChangeOrderHours(list, "wo-x")).toBe(7);
  });
});

describe("budget view", () => {
  const job = { id: "wo-x", lines: [labor(20), fuel] };

  it("shows original hours plus approved changes", () => {
    const v = budgetView(job, [co({ hoursAdded: 4 })], 6);
    expect(v).toMatchObject({
      originalHours: 20,
      changeOrderHours: 4,
      budgetHours: 24,
      hoursUsed: 6,
      hoursRemaining: 18,
      percentUsed: 25,
      status: "under_50",
    });
  });

  it("moves through 50%, 80%, 100%, and over", () => {
    expect(budgetView(job, [], 9.99).status).toBe("under_50");
    expect(budgetView(job, [], 10).status).toBe("at_50");
    expect(budgetView(job, [], 15.99).status).toBe("at_50");
    expect(budgetView(job, [], 16).status).toBe("at_80");
    expect(budgetView(job, [], 20).status).toBe("at_100");
    expect(budgetView(job, [], 20.01).status).toBe("over");
  });

  it("drops back when a change order raises the budget", () => {
    expect(budgetView(job, [], 18).status).toBe("at_80");
    expect(budgetView(job, [co({ hoursAdded: 10 })], 18).status).toBe("at_50");
  });

  it("reports the fake job wo-1001 as over budget", () => {
    const v = budgetView(wo("wo-1001"), changeOrders, 36.5);
    expect(v.budgetHours).toBe(34);
    expect(v.hoursRemaining).toBe(-2.5);
    expect(v.status).toBe("over");
  });

  it("handles a job with no budget", () => {
    expect(budgetView({ id: "wo-x", lines: [fuel] }, [], 0)).toMatchObject({ percentUsed: null, status: "under_50" });
    expect(budgetView({ id: "wo-x", lines: [fuel] }, [], 3).status).toBe("over");
  });

  it("never contains dollar amounts (safe for job leads)", () => {
    const keys = Object.keys(budgetView(job, [], 5));
    expect(keys.some((k) => /cost|wage|cents|dollar/i.test(k))).toBe(false);
  });
});
