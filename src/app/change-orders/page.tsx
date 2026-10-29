import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import DecideButtons from "@/app/jobs/[id]/change-orders/DecideButtons";
import { COMPANY_TIME_ZONE } from "@/lib/company-time";
import { one } from "@/lib/jobs-data";
import { formatHours } from "@/lib/my-jobs";
import { requireSession } from "@/lib/session";
import styles from "@/app/jobs/[id]/change-orders/change-orders.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Change orders waiting · WCOI Job Tracker" };

// Large change orders waiting for the owner, across all jobs (spec 6.7, decision 3:
// in-app badge). The owner approves or denies here; the bookkeeper can see the list.
export default async function PendingChangeOrdersPage() {
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

  const { data, error } = await supabase
    .from("change_orders")
    .select(
      `id, hours_added, description, requested_at,
      work_orders (id, ship_to_company, bill_to_company, quote_number),
      requester:app_users!change_orders_requested_by_fkey (employees (name))`,
    )
    .eq("status", "pending")
    .order("requested_at");
  if (error) throw new Error(`Loading change orders failed (${error.code})`);

  const isOwner = me.role === "owner";
  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/" backLabel="All jobs" />
      <h1 className={styles.title}>Change orders waiting</h1>
      <p className={styles.muted}>
        {isOwner ? "Large change orders need your approval before the budget changes." : "Waiting for the owner's approval."}
      </p>
      {data.length === 0 ? (
        <p className={styles.customer} style={{ marginTop: 20 }}>
          Nothing waiting.
        </p>
      ) : (
        <ul className={styles.list}>
          {data.map((c) => {
            const wo = one(c.work_orders);
            const hoursLabel = `+${formatHours(Number(c.hours_added))} hrs`;
            return (
              <li key={c.id} className={styles.item}>
                <div className={styles.itemTop}>
                  <Link href={`/jobs/${wo?.id}`} className={styles.jobLink}>
                    {wo?.ship_to_company || wo?.bill_to_company}
                    {wo?.quote_number ? ` · Quote ${wo.quote_number}` : ""}
                  </Link>
                  <strong>{hoursLabel}</strong>
                </div>
                <p>{c.description}</p>
                <p className={styles.muted}>
                  {one(one(c.requester)?.employees)?.name ?? "Someone"},{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: COMPANY_TIME_ZONE,
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(c.requested_at))}
                </p>
                {isOwner && <DecideButtons changeOrderId={c.id} hoursLabel={hoursLabel} />}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
