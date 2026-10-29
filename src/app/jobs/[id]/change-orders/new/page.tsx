import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { formatHours } from "@/lib/my-jobs";
import { requireSession } from "@/lib/session";
import { loadWorkOrder } from "@/lib/work-order-data";
import ChangeOrderForm from "./ChangeOrderForm";
import styles from "../change-orders.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Change order · WCOI Job Tracker" };

// New change order (spec 6.7): a short form. Quick ones count right away; large ones
// wait for the owner.
export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, lockMinutes } = await requireSession();
  if (!me) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>This sign-in is turned off</h1>
        <SignOutButton />
      </main>
    );
  }

  const [wo, { data: settings }] = await Promise.all([
    loadWorkOrder(supabase, me, id),
    supabase.from("settings").select("large_change_order_threshold_hours").maybeSingle(),
  ]);
  if (!wo) notFound();
  const canSubmit = me.role !== "lead" || wo.status === "open";

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref={`/jobs/${id}`} backLabel="Work order" />
      <h1 className={styles.title}>New change order</h1>
      <p className={styles.customer}>{wo.shipTo.company || wo.billTo.company}</p>
      {wo.budget && (
        <p className={styles.muted}>
          Budget now: {formatHours(wo.budget.budgetHours)} hrs ({formatHours(wo.budget.hoursUsed)} used)
        </p>
      )}
      {canSubmit ? (
        <ChangeOrderForm
          workOrderId={wo.id}
          thresholdHours={Number(settings?.large_change_order_threshold_hours ?? 4)}
          isHourlyJob={wo.jobType === "hourly"}
        />
      ) : (
        <p className={styles.locked}>
          This job has been turned in, so change orders go through the office now.{" "}
          <Link href={`/jobs/${id}`}>Back to the work order</Link>
        </p>
      )}
    </main>
  );
}
