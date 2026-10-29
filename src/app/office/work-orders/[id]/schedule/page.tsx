import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { UUID_RE } from "@/lib/hours-data";
import { one } from "@/lib/jobs-data";
import { requireStaffSession } from "@/lib/session";
import ScheduleForm from "./ScheduleForm";
import styles from "../../../office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads & crew · WCOI Job Tracker" };

// Assign leads and days, and set the crew (spec 6.1: replaces the whiteboard).
export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, lockMinutes } = await requireStaffSession();
  if (!UUID_RE.test(id)) notFound();

  const [{ data: wo }, { data: users }, { data: employees }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        `id, status, ship_to_company, bill_to_company,
        job_assignments (id, lead_user_id, job_assignment_dates (work_date), app_users (employees (name))),
        job_crew (employee_id, employees (name)),
        time_entries (employee_id)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("app_users").select("id, role, employees (name)").eq("active", true),
    supabase.from("employees").select("id, name").eq("active", true).order("name"),
  ]);
  if (!wo) notFound();

  const withHours = new Set(wo.time_entries.map((t) => t.employee_id as string));
  const assignments = wo.job_assignments
    .map((a) => ({
      id: a.id as string,
      leadUserId: a.lead_user_id as string,
      name: (one(one(a.app_users)?.employees)?.name as string) ?? "Unknown",
      dates: a.job_assignment_dates.map((d) => d.work_date as string).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const assigned = new Set(assignments.map((a) => a.leadUserId));
  const crew = wo.job_crew
    .map((c) => ({
      employeeId: c.employee_id as string,
      name: (one(c.employees)?.name as string) ?? "Unknown",
      hasHours: withHours.has(c.employee_id as string),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const onCrew = new Set(crew.map((c) => c.employeeId));
  const roleOrder = { lead: 0, owner: 1, bookkeeper: 2 } as const;

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref={`/jobs/${id}`} backLabel="Work order" />
      <h1 className={styles.title}>Leads, days &amp; crew</h1>
      <p className={styles.muted}>{wo.ship_to_company || wo.bill_to_company}</p>
      <ScheduleForm
        workOrderId={wo.id}
        assignments={assignments}
        leadChoices={(users ?? [])
          .filter((u) => !assigned.has(u.id))
          .map((u) => ({ id: u.id as string, name: (one(u.employees)?.name as string) ?? "", role: u.role as keyof typeof roleOrder }))
          .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name))}
        crew={crew}
        crewChoices={(employees ?? []).filter((e) => !onCrew.has(e.id))}
      />
    </main>
  );
}
