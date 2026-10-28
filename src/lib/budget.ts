// Budget math for quoted jobs (spec 5 "Calculations", 6.4, 6.7).
import { sumHours } from "./hours";
import type { ChangeOrder, ChangeOrderType, JobType, WorkOrder, WorkOrderLine } from "./types";

/** Original budget = sum of labor-line quantities. Non-labor lines (fuel surcharge) are excluded. */
export function originalBudgetHours(lines: WorkOrderLine[]): number {
  return sumHours(lines.filter((l) => l.isLabor && l.quantity > 0).map((l) => l.quantity));
}

/**
 * Job type (decision 1): quoted when labor lines carry hours, otherwise hourly.
 * A bookkeeper/owner override always wins.
 */
export function jobType(workOrder: Pick<WorkOrder, "lines" | "jobTypeOverride">): JobType {
  if (workOrder.jobTypeOverride) return workOrder.jobTypeOverride;
  return originalBudgetHours(workOrder.lines) > 0 ? "quoted" : "hourly";
}

/** Quick when the added hours are at or under the owner's threshold, large when above. */
export function changeOrderType(hoursAdded: number, largeThresholdHours: number): ChangeOrderType {
  return hoursAdded > largeThresholdHours ? "large" : "quick";
}

/**
 * Only approved change orders count. Quick changes are approved on submit;
 * large ones only once the owner approves. Pending and denied add nothing.
 */
export function approvedChangeOrderHours(changeOrders: ChangeOrder[], workOrderId: string): number {
  return sumHours(
    changeOrders
      .filter((c) => c.workOrderId === workOrderId && c.status === "approved")
      .map((c) => c.hoursAdded),
  );
}

export type BudgetStatus = "under_50" | "at_50" | "at_80" | "at_100" | "over";

export interface BudgetView {
  originalHours: number;
  changeOrderHours: number;
  budgetHours: number;
  hoursUsed: number;
  hoursRemaining: number;
  /** null when there is no budget to divide by. */
  percentUsed: number | null;
  status: BudgetStatus;
}

/**
 * Budget hours = labor lines + approved change orders. Percent used = hours used ÷ budget.
 * Status thresholds: 50%, 80%, exactly 100%, and "over" above 100% (6.4).
 * Contains no dollars, so it is safe to show to job leads.
 */
export function budgetView(
  workOrder: Pick<WorkOrder, "id" | "lines">,
  changeOrders: ChangeOrder[],
  hoursUsed: number,
): BudgetView {
  const originalHours = originalBudgetHours(workOrder.lines);
  const changeOrderHours = approvedChangeOrderHours(changeOrders, workOrder.id);
  const budgetHours = sumHours([originalHours, changeOrderHours]);
  const percentUsed = budgetHours > 0 ? (hoursUsed / budgetHours) * 100 : null;
  return {
    originalHours,
    changeOrderHours,
    budgetHours,
    hoursUsed,
    hoursRemaining: sumHours([budgetHours, -hoursUsed]),
    percentUsed,
    status: statusFor(hoursUsed, budgetHours),
  };
}

/** True when `used` is at least `percent`% of `budget`. Whole-number math, no rounding errors. */
export function reachedPercent(used: number, budget: number, percent: number): boolean {
  return Math.round(used * 100) * 100 >= Math.round(budget * 100) * percent;
}

function statusFor(used: number, budget: number): BudgetStatus {
  // No budget but hours were worked: that is over budget.
  if (budget <= 0) return used > 0 ? "over" : "under_50";
  if (Math.round(used * 100) > Math.round(budget * 100)) return "over";
  if (reachedPercent(used, budget, 100)) return "at_100";
  if (reachedPercent(used, budget, 80)) return "at_80";
  if (reachedPercent(used, budget, 50)) return "at_50";
  return "under_50";
}
