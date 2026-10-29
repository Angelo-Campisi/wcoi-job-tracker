import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { COMPANY_TIME_ZONE } from "@/lib/company-time";
import { formatDollars } from "@/lib/labor-cost";
import { budgetStatusLabel, formatHours, shortDate, WORK_ORDER_STATUS_LABELS } from "@/lib/my-jobs";
import { approvalBlockers, hoursGrid } from "@/lib/review-view";
import { requireSession } from "@/lib/session";
import { loadWorkOrder } from "@/lib/work-order-data";
import ReviewActions from "../ReviewActions";
import styles from "../review.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review · WCOI Job Tracker" };

// Review one turned-in job (spec 6.5): every hour on one screen, then approve.
export default async function ReviewJobPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (me.role === "lead") redirect(`/jobs/${id}`);

  const wo = await loadWorkOrder(supabase, me, id);
  if (!wo) notFound();
  if (wo.status === "open") redirect(`/jobs/${id}`);

  const grid = hoursGrid(wo.hoursDays);
  const pending = wo.changeOrders.filter((c) => c.status === "pending").length;
  const blockers = approvalBlockers({ pendingChangeOrders: pending, needsReviewEntries: wo.needsReviewEntries });
  const isHourly = wo.jobType === "hourly";

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/review" backLabel="Review" />

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{wo.shipTo.company || wo.billTo.company}</h1>
        <span className={styles.status}>{WORK_ORDER_STATUS_LABELS[wo.status]}</span>
      </div>
      <p className={styles.muted}>
        {isHourly ? "Hourly job" : "Quoted job"}
        {wo.quoteNumber && ` · Quote ${wo.quoteNumber}`}
        {wo.poNumber && ` · PO ${wo.poNumber}`}
        {" · "}
        <Link href={`/jobs/${wo.id}`} className={styles.link}>
          Open work order
        </Link>
      </p>
      <p>
        Turned in {wo.turnIn.at ? when(wo.turnIn.at) : ""}
        {wo.turnIn.by ? ` by ${wo.turnIn.by}` : ""}.{" "}
        {wo.turnIn.signedName
          ? `Signed by ${wo.turnIn.signedName}.`
          : wo.turnIn.note
            ? `No signature: ${wo.turnIn.note}`
            : ""}
      </p>
      {wo.approval.at && (
        <p>
          Approved {when(wo.approval.at)}
          {wo.approval.by ? ` by ${wo.approval.by}` : ""}.
        </p>
      )}

      <section className={styles.section} aria-label="Hours">
        <h2 className={styles.sectionTitle}>
          {isHourly ? "Billable hours" : "Hours"}: {formatHours(grid.total)}
        </h2>
        {isHourly && <p className={styles.muted}>Billed at the one labor rate in QuickBooks.</p>}
        {grid.people.length === 0 ? (
          <p className={styles.muted}>No hours were entered on this job.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  {grid.days.map((d) => (
                    <th key={d} scope="col" className={styles.num}>
                      {shortDate(d)}
                    </th>
                  ))}
                  <th scope="col" className={styles.num}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.people.map((p) => (
                  <tr key={p.employeeId}>
                    <th scope="row">{p.name}</th>
                    {grid.days.map((d) => {
                      const cell = p.cells.get(d);
                      return (
                        <td
                          key={d}
                          className={cell?.flagged ? styles.flagged : styles.num}
                          title={
                            cell?.flagged
                              ? `${formatHours(cell.dayTotalAllJobs)} hrs that day across all jobs (over ${formatHours(wo.dailyThreshold)})`
                              : undefined
                          }
                        >
                          {cell ? formatHours(cell.hours) : "–"}
                          {cell?.flagged && <span className={styles.flagMark}> ⚠</span>}
                        </td>
                      );
                    })}
                    <td className={styles.total}>{formatHours(p.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Day total</th>
                  {grid.days.map((d) => (
                    <td key={d} className={styles.total}>
                      {formatHours(grid.dayTotals.get(d) ?? 0)}
                    </td>
                  ))}
                  <td className={styles.total}>{formatHours(grid.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {grid.flaggedCount > 0 && (
          <p className={styles.flagNote}>
            ⚠ {grid.flaggedCount === 1 ? "1 day is" : `${grid.flaggedCount} days are`} over{" "}
            {formatHours(wo.dailyThreshold)} hours across all jobs. Check these before approving.
          </p>
        )}
      </section>

      {(wo.budget || wo.laborCost) && (
        <section className={styles.section} aria-label="Budget and cost">
          <h2 className={styles.sectionTitle}>{wo.budget ? "Budget and cost" : "Cost"}</h2>
          {wo.budget && (
            <p>
              {formatHours(wo.budget.hoursUsed)} of {formatHours(wo.budget.budgetHours)} budgeted hrs ·{" "}
              <strong className={styles[`tone_${budgetStatusLabel(wo.budget.status).tone}`]}>
                {budgetStatusLabel(wo.budget.status).label}
              </strong>
              {wo.budget.changeOrderHours > 0 && ` · includes ${formatHours(wo.budget.changeOrderHours)} hrs of approved changes`}
            </p>
          )}
          {wo.laborCost && (
            <p>
              Labor cost: <strong>{formatDollars(wo.laborCost.totalCents)}</strong>
              {wo.laborCost.missingWage.length > 0 && (
                <span className={styles.warnText}>
                  {" "}
                  ({wo.laborCost.missingWage.length} hours {wo.laborCost.missingWage.length === 1 ? "entry has" : "entries have"} no
                  wage on file and {wo.laborCost.missingWage.length === 1 ? "isn't" : "aren't"} counted)
                </span>
              )}
            </p>
          )}
        </section>
      )}

      {wo.changeOrders.length > 0 && (
        <section className={styles.section} aria-label="Change orders">
          <h2 className={styles.sectionTitle}>Change orders</h2>
          <ul className={styles.list}>
            {wo.changeOrders.map((c) => (
              <li key={c.id}>
                +{formatHours(c.hoursAdded)} hrs, {c.type} — {c.description} —{" "}
                <strong>{c.status === "pending" ? "waiting for owner" : c.status}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-label="Review">
        <h2 className={styles.sectionTitle}>Review</h2>
        <ReviewActions workOrderId={wo.id} status={wo.status} blockers={blockers} />
      </section>
    </main>
  );
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
