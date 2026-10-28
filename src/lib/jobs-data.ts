import "server-only";
import { budgetView, jobType, type BudgetView } from "./budget";
import { sumHours } from "./hours";
import type { createClient } from "./supabase/server";
import type { ChangeOrder, JobType, WorkOrderStatus } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface Me {
  appUserId: string;
  name: string;
  role: "lead" | "bookkeeper" | "owner";
}

export interface JobCard {
  id: string;
  quoteNumber: string;
  poNumber: string;
  status: WorkOrderStatus;
  customer: string;
  billTo: string;
  address: string;
  jobType: JobType;
  /** Hours only, no dollars, so it is safe for leads. Null for hourly jobs. */
  budget: BudgetView | null;
  hoursUsed: number;
  /** For a lead: days they lead this job. For office staff: every scheduled day. */
  dates: string[];
  /** Lead names (shown to office staff). */
  leads: string[];
  /** Large change orders waiting for the owner. */
  pendingChangeOrders: number;
}

/** The signed-in person, or null if their login has no active app user. */
export async function loadMe(supabase: Supabase, authUserId: string): Promise<Me | null> {
  const { data } = await supabase
    .from("app_users")
    .select("id, role, employees(name)")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return { appUserId: data.id, role: data.role, name: one(data.employees)?.name ?? "" };
}

/**
 * Jobs the signed-in person can see. Row-level security does the filtering:
 * leads get only their assigned jobs, office staff get all of them.
 */
export async function loadJobCards(supabase: Supabase, me: Me): Promise<JobCard[]> {
  const { data, error } = await supabase.from("work_orders").select(`
      id, quote_number, po_number, status, job_type_override,
      bill_to_company, ship_to_company, ship_to_address,
      work_order_lines (quantity, is_labor),
      job_assignments (lead_user_id, job_assignment_dates (work_date), app_users (employees (name))),
      change_orders (id, hours_added, status, type),
      time_entries (hours)
    `);
  if (error) throw new Error(`Loading jobs failed (${error.code})`);

  return data.map((row) => {
    const lines = row.work_order_lines.map((l) => ({
      description: "",
      quantity: Number(l.quantity),
      isLabor: l.is_labor,
    }));
    const type = jobType({ lines, jobTypeOverride: row.job_type_override });
    const changeOrders: ChangeOrder[] = row.change_orders.map((c) => ({
      id: c.id,
      workOrderId: row.id,
      type: c.type,
      hoursAdded: Number(c.hours_added),
      description: "",
      requestedByUserId: "",
      status: c.status,
      approvedByUserId: null,
    }));
    const hoursUsed = sumHours(row.time_entries.map((t) => Number(t.hours)));

    // A lead sees only the days they lead; another lead may run other days of the same job.
    const assignments =
      me.role === "lead" ? row.job_assignments.filter((a) => a.lead_user_id === me.appUserId) : row.job_assignments;
    const dates = [...new Set(assignments.flatMap((a) => a.job_assignment_dates.map((d) => d.work_date)))].sort();
    const leads = row.job_assignments
      .map((a) => one(one(a.app_users)?.employees)?.name)
      .filter((n): n is string => Boolean(n));

    return {
      id: row.id,
      quoteNumber: row.quote_number,
      poNumber: row.po_number,
      status: row.status,
      customer: row.ship_to_company || row.bill_to_company,
      billTo: row.bill_to_company,
      address: row.ship_to_address,
      jobType: type,
      budget: type === "quoted" ? budgetView({ id: row.id, lines }, changeOrders, hoursUsed) : null,
      hoursUsed,
      dates,
      leads,
      pendingChangeOrders: row.change_orders.filter((c) => c.status === "pending").length,
    };
  });
}

/** Supabase returns a joined row as an object or a one-item list depending on the link; accept both. */
export function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}
