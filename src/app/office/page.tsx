import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireStaffSession } from "@/lib/session";
import styles from "./office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Office · WCOI Job Tracker" };

// Office setup (bookkeeper and owner): work orders, people, settings.
export default async function OfficePage() {
  const { me, lockMinutes } = await requireStaffSession();
  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/" backLabel="All jobs" />
      <h1 className={styles.title}>Office</h1>
      <ul className={styles.hub}>
        <li>
          <Link href="/office/work-orders/new" className={styles.hubCard}>
            <strong>New work order</strong>
            <span className={styles.muted}>Enter a job, its line items, and budget hours.</span>
          </Link>
        </li>
        <li>
          <Link href="/" className={styles.hubCard}>
            <strong>Edit a work order</strong>
            <span className={styles.muted}>Open the job from All jobs, then tap Edit or Leads &amp; crew.</span>
          </Link>
        </li>
        <li>
          <Link href="/office/people" className={styles.hubCard}>
            <strong>People</strong>
            <span className={styles.muted}>Employees, wages, sign-ins, and PINs.</span>
          </Link>
        </li>
        <li>
          <Link href="/office/settings" className={styles.hubCard}>
            <strong>Settings</strong>
            <span className={styles.muted}>Daily hours warning, change order limit, screen lock, PIN rules.</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
