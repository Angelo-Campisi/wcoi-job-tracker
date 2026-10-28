import "server-only";
import { budgetView, jobType, type BudgetView } from "./budget";
import { sumHours } from "./hours";
import { one, type Me } from "./jobs-data";
import { costEntries, type LaborCostResult } from "./labor-cost";
import type { createClient } from "./supabase/server";
import type { ChangeOrder, ChangeOrderStatus, ChangeOrderType, JobType, TimeEntry, Wage, WorkOrderStatus } from "./types";
import { hoursByDay, type HoursDay } from "./work-order-view";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WorkOrderDetail {
  id: string;
  quoteNumber: string;
  poNumber: string;
  orderDate: string;
  status: WorkOrderStatus;
  jobType: JobType;
  notes: string;
  shipTo: { company: string; address: string; contact: string; phone: string };
  billTo: { company: string; contact: string; phone: string };
  lines: { lineNumber: number; description: string; quantity: number; isLabor: boolean }[];
  /** For a lead: days they lead. For office staff: every scheduled day. */
  dates: string[];
  leads: string[];
  crew: string[];
  /** Hours only. Null for hourly jobs. */
  budget: BudgetView | null;
  hoursUsed: number;
  hoursDays: HoursDay[];
  dailyThreshold: number;
  changeOrders: {
    id: string;
    type: ChangeOrderType;
    status: ChangeOrderStatus;
    hoursAdded: number;
    description: string;
    requestedBy: string;
    requestedAt: string;
    decidedAt: string | null;
  }[];
  turnIn: { at: string | null; by: string | null; signedName: string | null };
  /** Bookkeeper and owner only; always null for leads. */
  laborCost: LaborCostResult | null;
}

/**
 * One work order as the signed-in person sees it. Returns null when it doesn't
 * exist or they aren't allowed to see it (row-level security hides it).
 */
export async function loadWorkOrder(supabase: Supabase, me: Me, id: string): Promise<WorkOrderDetail | null> {
  if (!UUID_RE.test(id)) return null;

  const [{ data: row, error }, { data: settings }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        `id, quote_number, po_number, order_date, status, job_type_override, notes,
        bill_to_company, bill_to_contact, bill_to_phone,
        ship_to_company, ship_to_address, ship_to_contact, ship_to_phone,
        turned_in_at, customer_signed_name,
        turned_in_user:app_users!work_orders_turned_in_by_fkey (employees (name)),
        work_order_lines (line_number, description, quantity, is_labor),
        job_assignments (lead_user_id, job_assignment_dates (work_date), app_users (employees (name))),
        job_crew (employees (name)),
        change_orders (id, type, status, hours_added, description, requested_at, decided_at,
          requester:app_users!change_orders_requested_by_fkey (employees (name))),
        time_entries (id, employee_id, work_date, hours, entered_by, employees (name))`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("settings").select("daily_hours_threshold").maybeSingle(),
  ]);
  if (error) throw new Error(`Loading work order failed (${error.code})`);
  if (!row) return null;

  const lines = row.work_order_lines
    .map((l) => ({
      lineNumber: l.line_number as number,
      description: l.description as string,
      quantity: Number(l.quantity),
      isLabor: l.is_labor as boolean,
    }))
    .sort((a, b) => a.lineNumber - b.lineNumber);
  const type = jobType({ lines, jobTypeOverride: row.job_type_override });

  const entries: TimeEntry[] = row.time_entries.map((t) => ({
    id: t.id,
    workOrderId: row.id,
    employeeId: t.employee_id,
    date: t.work_date,
    hours: Number(t.hours),
    enteredByUserId: t.entered_by ?? "",
  }));
  const names = new Map<string, string>(
    row.time_entries.map((t) => [t.employee_id as string, (one(t.employees)?.name as string) ?? ""]),
  );
  const hoursUsed = sumHours(entries.map((e) => e.hours));

  const changeOrdersForBudget: ChangeOrder[] = row.change_orders.map((c) => ({
    id: c.id,
    workOrderId: row.id,
    type: c.type,
    hoursAdded: Number(c.hours_added),
    description: c.description,
    requestedByUserId: "",
    status: c.status,
    approvedByUserId: null,
  }));

  const assignments =
    me.role === "lead" ? row.job_assignments.filter((a) => a.lead_user_id === me.appUserId) : row.job_assignments;
  const dates = [...new Set(assignments.flatMap((a) => a.job_assignment_dates.map((d) => d.work_date)))].sort();

  const threshold = Number(settings?.daily_hours_threshold ?? 8);
  const isStaff = me.role !== "lead";
  const [dayTotals, laborCost] = await Promise.all([
    loadDayTotals(supabase, entries),
    isStaff ? loadLaborCost(supabase, entries) : Promise.resolve(null),
  ]);

  return {
    id: row.id,
    quoteNumber: row.quote_number,
    poNumber: row.po_number,
    orderDate: row.order_date,
    status: row.status,
    jobType: type,
    notes: row.notes,
    shipTo: {
      company: row.ship_to_company,
      address: row.ship_to_address,
      contact: row.ship_to_contact,
      phone: row.ship_to_phone,
    },
    billTo: { company: row.bill_to_company, contact: row.bill_to_contact, phone: row.bill_to_phone },
    lines,
    dates,
    leads: names_(row.job_assignments.map((a) => one(one(a.app_users)?.employees)?.name)),
    crew: names_(row.job_crew.map((c) => one(c.employees)?.name)).sort((a, b) => a.localeCompare(b)),
    budget: type === "quoted" ? budgetView({ id: row.id, lines }, changeOrdersForBudget, hoursUsed) : null,
    hoursUsed,
    hoursDays: hoursByDay(entries, row.id, names, dayTotals, threshold),
    dailyThreshold: threshold,
    changeOrders: row.change_orders
      .map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        hoursAdded: Number(c.hours_added),
        description: c.description,
        requestedBy: (one(one(c.requester)?.employees)?.name as string) ?? "",
        requestedAt: c.requested_at,
        decidedAt: c.decided_at,
      }))
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    turnIn: {
      at: row.turned_in_at,
      by: (one(one(row.turned_in_user)?.employees)?.name as string) ?? null,
      signedName: row.customer_signed_name,
    },
    laborCost,
  };
}

// Each crew member's hours across ALL jobs on each day this job has hours, for the
// daily flag. Uses employee_day_hours, which returns hours only (safe for leads).
async function loadDayTotals(supabase: Supabase, entries: TimeEntry[]): Promise<Map<string, number>> {
  const byDate = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, new Set());
    byDate.get(e.date)!.add(e.employeeId);
  }
  const totals = new Map<string, number>();
  await Promise.all(
    [...byDate].map(async ([date, ids]) => {
      const { data, error } = await supabase.rpc("employee_day_hours", {
        p_employee_ids: [...ids],
        p_work_date: date,
      });
      if (error) throw new Error(`Loading day totals failed (${error.code})`);
      for (const r of data as { employee_id: string; hours: number }[]) {
        totals.set(`${r.employee_id}|${date}`, Number(r.hours));
      }
    }),
  );
  return totals;
}

// Labor cost from effective-dated wages. The wages table is staff-only in the
// database, so this is only ever called for the bookkeeper or owner.
async function loadLaborCost(supabase: Supabase, entries: TimeEntry[]): Promise<LaborCostResult> {
  const ids = [...new Set(entries.map((e) => e.employeeId))];
  if (ids.length === 0) return costEntries([], []);
  const { data, error } = await supabase
    .from("employee_wages")
    .select("employee_id, hourly_wage, effective_from")
    .in("employee_id", ids);
  if (error) throw new Error(`Loading wages failed (${error.code})`);
  const wages: Wage[] = data.map((w) => ({
    employeeId: w.employee_id,
    hourlyWage: Number(w.hourly_wage),
    effectiveFrom: w.effective_from,
  }));
  return costEntries(entries, wages);
}

function names_(list: (string | undefined | null)[]): string[] {
  return list.filter((n): n is string => Boolean(n));
}
