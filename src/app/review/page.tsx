import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { COMPANY_TIME_ZONE } from "@/lib/company-time";
import { sumHours } from "@/lib/hours";
import { one } from "@/lib/jobs-data";
import { formatHours } from "@/lib/my-jobs";
import { requireSession } from "@/lib/session";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review · WCOI Job Tracker" };

const RECENT_APPROVED = 10;

// Bookkeeper review list (spec 6.5): turned-in jobs waiting, oldest first,
// then the most recently approved.
export default async function ReviewListPage() {
  const { supabase, me, lockMinutes } = await requireSession();
  if (!me) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>This sign-in is turned off</h1>
        <SignOutButton />
      </main>
    );
  }
  if (me.role === "lead") redirect("/");

  const select = `id, ship_to_company, bill_to_company, quote_number, turned_in_at, approved_at,
    turned_in_user:app_users!work_orders_turned_in_by_fkey (employees (name)),
    time_entries (hours), change_orders (status)`;
  const [{ data: waiting, error: e1 }, { data: approved, error: e2 }] = await Promise.all([
    supabase.from("work_orders").select(select).eq("status", "turned_in").order("turned_in_at"),
    supabase
      .from("work_orders")
      .select(select)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(RECENT_APPROVED),
  ]);
  if (e1 || e2) throw new Error(`Loading review list failed (${(e1 ?? e2)!.code})`);

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/" backLabel="All jobs" />
      <h1 className={styles.title}>Review</h1>

      <section className={styles.section} aria-label="Waiting for review">
        <h2 className={styles.sectionTitle}>Waiting for review ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className={styles.muted}>Nothing waiting. Turned-in jobs show up here.</p>
        ) : (
          <JobList jobs={waiting} />
        )}
      </section>

      {approved.length > 0 && (
        <section className={styles.section} aria-label="Recently approved">
          <h2 className={styles.sectionTitle}>Recently approved</h2>
          <JobList jobs={approved} approved />
        </section>
      )}
    </main>
  );
}

type Row = {
  id: string;
  ship_to_company: string;
  bill_to_company: string;
  quote_number: string;
  turned_in_at: string | null;
  approved_at: string | null;
  turned_in_user: unknown;
  time_entries: { hours: number }[];
  change_orders: { status: string }[];
};

function JobList({ jobs, approved = false }: { jobs: Row[]; approved?: boolean }) {
  return (
    <ul className={styles.cards}>
      {jobs.map((j) => {
        const lead = one(one(j.turned_in_user as { employees: { name: string } | { name: string }[] } | null)?.employees)?.name;
        const pending = j.change_orders.filter((c) => c.status === "pending").length;
        const at = approved ? j.approved_at : j.turned_in_at;
        return (
          <li key={j.id}>
            <Link href={`/review/${j.id}`} className={styles.card}>
              <span className={styles.cardTitle}>{j.ship_to_company || j.bill_to_company}</span>
              <span>
                {formatHours(sumHours(j.time_entries.map((t) => Number(t.hours))))} hrs
                {j.quote_number && ` · Quote ${j.quote_number}`}
              </span>
              <span className={styles.muted}>
                {approved ? "Approved" : "Turned in"} {at ? when(at) : ""}
                {!approved && lead ? ` by ${lead}` : ""}
              </span>
              {pending > 0 && <span className={styles.warnText}>Change order waiting for the owner</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: COMPANY_TIME_ZONE, month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}
