"use server";

import { revalidatePath } from "next/cache";
import { companyToday } from "@/lib/company-time";
import { DATE_RE, loadHoursBetween, UUID_RE } from "@/lib/hours-data";
import { dailyFlags, hoursChanges, hoursProblems } from "@/lib/hours-entry";
import { createClient } from "@/lib/supabase/server";

export type SaveHoursResult =
  | { ok: true; saved: number }
  | { ok: false; error: string }
  | { ok: false; needsConfirm: { name: string; dayTotal: number }[] };

const LOCKED = "Hours on this job can't be changed anymore. It has been turned in. Ask the office.";
const TROUBLE = "Couldn't save. Check the tablet's signal and try again.";

/**
 * Saves one day of hours on one job (spec 6.3). Checks the daily hours flag on the
 * server with fresh numbers; if anyone goes over, asks the lead to confirm first.
 * The database decides who may save (leads only on their own open jobs).
 */
export async function saveDayHours(input: {
  workOrderId: string;
  date: string;
  hours: Record<string, number | null>;
  confirmed: boolean;
}): Promise<SaveHoursResult> {
  const { workOrderId, date, confirmed } = input;
  if (!UUID_RE.test(workOrderId) || !DATE_RE.test(date)) return { ok: false, error: TROUBLE };
  if (date > companyToday()) return { ok: false, error: "Hours can't be entered for a day that hasn't happened yet." };

  const edited = new Map<string, number | null>();
  for (const [employeeId, hours] of Object.entries(input.hours ?? {})) {
    if (!UUID_RE.test(employeeId) || (hours !== null && typeof hours !== "number")) return { ok: false, error: TROUBLE };
    edited.set(employeeId, hours);
  }
  const problem = hoursProblems(edited).values().next().value;
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return { ok: false, error: "You've been signed out. Sign in again." };

  // Fresh numbers: what's saved on this job for the day, and across all jobs.
  const [{ data: savedRows, error: savedError }, { data: names }] = await Promise.all([
    supabase.from("time_entries").select("employee_id, hours").eq("work_order_id", workOrderId).eq("work_date", date),
    supabase.from("employees").select("id, name").in("id", [...edited.keys()]),
  ]);
  if (savedError) return { ok: false, error: TROUBLE };
  const saved = new Map<string, number>(savedRows.map((r) => [r.employee_id as string, Number(r.hours)]));
  const changes = hoursChanges(saved, edited);
  if (changes.upserts.length === 0 && changes.deletes.length === 0) return { ok: true, saved: 0 };

  if (!confirmed) {
    let allJobs: Map<string, Map<string, number>>;
    try {
      allJobs = await loadHoursBetween(supabase, [...edited.keys()], date, date);
    } catch {
      return { ok: false, error: TROUBLE };
    }
    const allJobsDay = new Map([...allJobs].map(([id, days]) => [id, days.get(date) ?? 0]));
    // Only warn about people whose hours are actually changing.
    const changing = new Map(changes.upserts.map((u) => [u.employeeId, u.hours] as [string, number | null]));
    const flags = dailyFlags(changing, saved, allJobsDay, await threshold(supabase));
    if (flags.length > 0) {
      const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.name as string]));
      return {
        ok: false,
        needsConfirm: flags.map((f) => ({ name: nameOf.get(f.employeeId) ?? "Someone", dayTotal: f.dayTotal })),
      };
    }
  }

  if (changes.upserts.length > 0) {
    const { data, error } = await supabase
      .from("time_entries")
      .upsert(
        changes.upserts.map((u) => ({ work_order_id: workOrderId, employee_id: u.employeeId, work_date: date, hours: u.hours })),
        { onConflict: "work_order_id,employee_id,work_date" },
      )
      .select("id");
    if (error) return { ok: false, error: friendly(error) };
    if ((data?.length ?? 0) !== changes.upserts.length) return { ok: false, error: LOCKED };
  }
  if (changes.deletes.length > 0) {
    const { data, error } = await supabase
      .from("time_entries")
      .delete()
      .eq("work_order_id", workOrderId)
      .eq("work_date", date)
      .in("employee_id", changes.deletes)
      .select("id");
    if (error) return { ok: false, error: friendly(error) };
    if ((data?.length ?? 0) !== changes.deletes.length) return { ok: false, error: LOCKED };
  }

  revalidatePath(`/jobs/${workOrderId}`);
  return { ok: true, saved: changes.upserts.length + changes.deletes.length };
}

export type CrewResult = { ok: true } | { ok: false; error: string };

/** Adds an employee to the job's crew. Leads: own open jobs only (database rule). */
export async function addToCrew(workOrderId: string, employeeId: string): Promise<CrewResult> {
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(employeeId)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { error } = await supabase.from("job_crew").insert({ work_order_id: workOrderId, employee_id: employeeId });
  if (error && error.code !== "23505") return { ok: false, error: friendly(error) };
  revalidatePath(`/jobs/${workOrderId}`);
  return { ok: true };
}

/** Removes an employee from the crew. Refused while they have hours on this job. */
export async function removeFromCrew(workOrderId: string, employeeId: string): Promise<CrewResult> {
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(employeeId)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_crew")
    .delete()
    .eq("work_order_id", workOrderId)
    .eq("employee_id", employeeId)
    .select("employee_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data?.length) return { ok: false, error: LOCKED };
  revalidatePath(`/jobs/${workOrderId}`);
  return { ok: true };
}

async function threshold(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase.from("settings").select("daily_hours_threshold").maybeSingle();
  return Number(data?.daily_hours_threshold ?? 8);
}

// Database messages written for people (crew rules) pass through; anything else
// becomes a plain message. Never shows raw database errors on the tablet.
function friendly(error: { code?: string; message: string }): string {
  if (error.code === "42501") return LOCKED;
  if (error.code === "23503" || error.code === "23514") return error.message;
  console.error("Hours save failed", error.code);
  return TROUBLE;
}
