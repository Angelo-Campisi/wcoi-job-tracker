import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { companyToday } from "@/lib/company-time";
import { one } from "@/lib/jobs-data";
import { wageOn } from "@/lib/labor-cost";
import { requireStaffSession } from "@/lib/session";
import AddPersonForm from "./AddPersonForm";
import styles from "../office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People · WCOI Job Tracker" };

const ROLE_LABELS = { lead: "Job lead", bookkeeper: "Bookkeeper", owner: "Owner" } as const;

// Everyone who works here: crew, leads, office. Wages are office-only (database rule).
export default async function PeoplePage() {
  const { supabase, me, lockMinutes } = await requireStaffSession();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, active, app_users (role, active), employee_wages (employee_id, hourly_wage, effective_from)")
    .order("name");
  if (error) throw new Error(`Loading people failed (${error.code})`);
  const today = companyToday();

  const people = data.map((e) => {
    const wages = e.employee_wages.map((w) => ({
      employeeId: w.employee_id as string,
      hourlyWage: Number(w.hourly_wage),
      effectiveFrom: w.effective_from as string,
    }));
    const user = one(e.app_users);
    return {
      id: e.id as string,
      name: e.name as string,
      active: e.active as boolean,
      role: user ? (user.role as keyof typeof ROLE_LABELS) : null,
      signInActive: user?.active ?? false,
      wage: wageOn(wages, e.id as string, today)?.hourlyWage ?? null,
    };
  });
  const active = people.filter((p) => p.active);
  const inactive = people.filter((p) => !p.active);

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/office" backLabel="Office" />
      <h1 className={styles.title}>People</h1>

      <section className={styles.section} aria-label="Add a person">
        <h2 className={styles.sectionTitle}>Add a person</h2>
        <AddPersonForm isOwner={me.role === "owner"} today={today} />
      </section>

      <PeopleList title={`Working (${active.length})`} people={active} />
      {inactive.length > 0 && <PeopleList title={`No longer working (${inactive.length})`} people={inactive} />}
    </main>
  );
}

function PeopleList({
  title,
  people,
}: {
  title: string;
  people: { id: string; name: string; role: keyof typeof ROLE_LABELS | null; signInActive: boolean; wage: number | null }[];
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.list}>
        {people.map((p) => (
          <li key={p.id} className={styles.row}>
            <span>
              <Link href={`/office/people/${p.id}`} className={styles.rowLink}>
                {p.name}
              </Link>
              {p.role && <span className={p.signInActive ? styles.tag : styles.tagOff}>{ROLE_LABELS[p.role]}{p.signInActive ? "" : " (off)"}</span>}
            </span>
            <span className={p.wage === null ? styles.fieldError : undefined}>
              {p.wage === null ? "No wage on file" : `$${p.wage.toFixed(2)}/hr`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
