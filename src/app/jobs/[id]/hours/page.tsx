import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { companyToday } from "@/lib/company-time";
import { addDays } from "@/lib/dates";
import { DATE_RE, loadHoursDay } from "@/lib/hours-data";
import { requireSession } from "@/lib/session";
import HoursForm from "./HoursForm";
import styles from "./hours.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hours · WCOI Job Tracker" };

// Hours entry (spec 6.3): one day at a time, hours only, for each person on the crew.
export default async function HoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ id }, { date: asked }] = await Promise.all([params, searchParams]);
  const today = companyToday();
  // No hours for days that haven't happened yet.
  if (asked && (!DATE_RE.test(asked) || asked > today)) redirect(`/jobs/${id}/hours`);
  const date = asked ?? today;

  const { supabase, me, lockMinutes } = await requireSession();
  if (!me) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>This sign-in is turned off</h1>
        <SignOutButton />
      </main>
    );
  }

  const day = await loadHoursDay(supabase, me, id, date);
  if (!day) notFound();

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref={`/jobs/${id}`} backLabel="Work order" />
      <h1 className={styles.title}>Hours</h1>
      <p className={styles.customer}>{day.customer}</p>
      <HoursForm
        // A fresh form whenever the day or the saved hours change.
        key={`${date}|${day.crew.map((c) => `${c.employeeId}:${c.savedHours}`).join(",")}`}
        day={day}
        today={today}
        prevDate={addDays(date, -1)}
        nextDate={date < today ? addDays(date, 1) : null}
      />
    </main>
  );
}
