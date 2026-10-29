import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { companyToday } from "@/lib/company-time";
import { UUID_RE } from "@/lib/hours-data";
import { one } from "@/lib/jobs-data";
import { requireStaffSession } from "@/lib/session";
import PersonForms from "./PersonForms";
import styles from "../../office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Person · WCOI Job Tracker" };

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warning?: string }>;
}) {
  const [{ id }, { warning }] = await Promise.all([params, searchParams]);
  const { supabase, me, lockMinutes } = await requireStaffSession();
  if (!UUID_RE.test(id)) notFound();

  const { data: e } = await supabase
    .from("employees")
    .select("id, name, active, app_users (id, role, active), employee_wages (id, hourly_wage, effective_from)")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  const user = one(e.app_users);

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/office/people" backLabel="People" />
      <h1 className={styles.title}>{e.name}</h1>
      {warning && (
        <p className={styles.error} role="alert">
          {warning.slice(0, 300)}
        </p>
      )}
      <PersonForms
        today={companyToday()}
        isOwner={me.role === "owner"}
        isSelf={user?.id === me.appUserId}
        employee={{ id: e.id, name: e.name, active: e.active }}
        wages={e.employee_wages
          .map((w) => ({ id: w.id as string, wage: Number(w.hourly_wage), from: w.effective_from as string }))
          .sort((a, b) => b.from.localeCompare(a.from))}
        signIn={user ? { id: user.id as string, role: user.role as "lead" | "bookkeeper" | "owner", active: user.active as boolean } : null}
      />
    </main>
  );
}
