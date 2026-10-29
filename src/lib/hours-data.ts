import "server-only";
import { weekOf } from "./hours-entry";
import { sumHours } from "./hours";
import { one, type Me } from "./jobs-data";
import type { createClient } from "./supabase/server";
import type { WorkOrderStatus } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CrewRow {
  employeeId: string;
  name: string;
  /** Saved hours on this job for the day, or null. */
  savedHours: number | null;
  /** Saved hours across ALL jobs that day (this job included). */
  allJobsDay: number;
  /** Saved hours across all jobs for the Monday–Sunday week. */
  weekTotal: number;
  /** Has hours on this job on any day (then they can't be removed from the crew). */
  hasHoursOnJob: boolean;
}

export interface HoursDay {
  workOrderId: string;
  customer: string;
  status: WorkOrderStatus;
  /** Leads: only while the job is open. Office: always (every edit is logged). */
  canEdit: boolean;
  /** Office only. Job leads enter hours for today only (owner's decision). */
  canPickDay: boolean;
  date: string;
  week: { start: string; end: string };
  crew: CrewRow[];
  /** Active employees not on the crew yet, for "Add to crew". */
  available: { id: string; name: string }[];
  /** Days to offer as quick picks: scheduled days and days that already have hours. */
  quickDates: string[];
  threshold: number;
}

/** One day of hours on one job, as the signed-in person sees it. Null if not visible. */
export async function loadHoursDay(supabase: Supabase, me: Me, workOrderId: string, date: string): Promise<HoursDay | null> {
  if (!UUID_RE.test(workOrderId) || !DATE_RE.test(date)) return null;

  const [{ data: row, error }, { data: employees }, { data: settings }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        `id, status, ship_to_company, bill_to_company,
        job_crew (employee_id, employees (name)),
        job_assignments (lead_user_id, job_assignment_dates (work_date)),
        day_entries:time_entries (employee_id, hours),
        all_entries:time_entries (work_date, employee_id)`,
      )
      .eq("id", workOrderId)
      .eq("day_entries.work_date", date)
      .maybeSingle(),
    supabase.from("employees").select("id, name").eq("active", true).order("name"),
    supabase.from("settings").select("daily_hours_threshold").maybeSingle(),
  ]);
  if (error) throw new Error(`Loading hours failed (${error.code})`);
  if (!row) return null;

  const crewIds = row.job_crew.map((c) => c.employee_id as string);
  const week = weekOf(date);
  const totals = await loadHoursBetween(supabase, crewIds, week.start, week.end);

  const saved = new Map<string, number>(row.day_entries.map((e) => [e.employee_id as string, Number(e.hours)]));
  const withHours = new Set(row.all_entries.map((e) => e.employee_id as string));
  const crew: CrewRow[] = row.job_crew
    .map((c) => {
      const id = c.employee_id as string;
      const days = totals.get(id) ?? new Map<string, number>();
      return {
        employeeId: id,
        name: (one(c.employees)?.name as string) ?? "Unknown employee",
        savedHours: saved.get(id) ?? null,
        allJobsDay: days.get(date) ?? 0,
        weekTotal: sumHours([...days.values()]),
        hasHoursOnJob: withHours.has(id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const assignments =
    me.role === "lead" ? row.job_assignments.filter((a) => a.lead_user_id === me.appUserId) : row.job_assignments;
  const quickDates = [
    ...new Set([
      ...assignments.flatMap((a) => a.job_assignment_dates.map((d) => d.work_date as string)),
      ...row.all_entries.map((e) => e.work_date as string),
    ]),
  ].sort();

  const onCrew = new Set(crewIds);
  return {
    workOrderId: row.id,
    customer: row.ship_to_company || row.bill_to_company,
    status: row.status,
    // Approved or sent jobs are locked for everyone (undo the approval to change hours).
    canEdit: (me.role !== "lead" || row.status === "open") && row.status !== "approved" && row.status !== "sent",
    canPickDay: me.role !== "lead",
    date,
    week,
    crew,
    available: (employees ?? []).filter((e) => !onCrew.has(e.id)),
    quickDates,
    threshold: Number(settings?.daily_hours_threshold ?? 8),
  };
}

/** Each employee's hours per day across ALL jobs (hours only, safe for leads). */
export async function loadHoursBetween(
  supabase: Supabase,
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (employeeIds.length === 0) return result;
  const { data, error } = await supabase.rpc("employee_hours_between", {
    p_employee_ids: employeeIds,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`Loading hours across jobs failed (${error.code})`);
  for (const r of data as { employee_id: string; work_date: string; hours: number }[]) {
    if (!result.has(r.employee_id)) result.set(r.employee_id, new Map());
    result.get(r.employee_id)!.set(r.work_date, Number(r.hours));
  }
  return result;
}
