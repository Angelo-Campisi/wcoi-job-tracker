import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { companyToday } from "@/lib/company-time";
import { formatHours, shortDate } from "@/lib/my-jobs";
import { requireSession } from "@/lib/session";
import { totalsByPerson, turnInWarnings } from "@/lib/turn-in";
import { loadWorkOrder } from "@/lib/work-order-data";
import TurnInForm from "./TurnInForm";
import styles from "./turn-in.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turn in · WCOI Job Tracker" };

// Turn-in (spec 6.5, 6.6): show the customer the job, get their signature, and lock it.
export default async function TurnInPage({ params }: { params: Promise<{ id: string }> }) {
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

  const wo = await loadWorkOrder(supabase, me, id);
  if (!wo) notFound();
  if (wo.status !== "open") redirect(`/jobs/${id}`);

  const today = companyToday();
  const warnings = turnInWarnings({
    hoursTotal: wo.hoursUsed,
    hasHoursToday: wo.hoursDays.some((d) => d.date === today),
    pendingChangeOrders: wo.changeOrders.filter((c) => c.status === "pending").length,
  });
  const isHourly = wo.jobType === "hourly";
  const days = [...wo.hoursDays].reverse();

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref={`/jobs/${id}`} backLabel="Work order" />
      <h1 className={styles.title}>Turn in work order</h1>

      {warnings.length > 0 && (
        <section className={styles.warnings} aria-label="Check before turning in">
          <h2 className={styles.warningsTitle}>Check before turning in</h2>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Turn the tablet toward the customer for this part. No budget or dollars here. */}
      <section className={styles.summary} aria-label="Job summary for the customer">
        <p className={styles.label}>Job summary</p>
        <h2 className={styles.customer}>{wo.shipTo.company || wo.billTo.company}</h2>
        <p>{wo.shipTo.address}</p>
        <p className={styles.muted}>
          {[wo.quoteNumber && `Quote ${wo.quoteNumber}`, wo.poNumber && `PO ${wo.poNumber}`].filter(Boolean).join(" · ")}
        </p>

        <h3 className={styles.subTitle}>Work</h3>
        <ul className={styles.list}>
          {wo.lines
            .filter((l) => l.isLabor)
            .map((l) => (
              <li key={l.lineNumber}>{l.description}</li>
            ))}
          {wo.changeOrders
            .filter((c) => c.status === "approved")
            .map((c) => (
              <li key={c.id}>Change: {c.description}</li>
            ))}
        </ul>

        {isHourly && (
          <>
            <h3 className={styles.subTitle}>Hours</h3>
            {days.length === 0 ? (
              <p className={styles.muted}>No hours entered.</p>
            ) : (
              <>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      <th scope="col">Crew</th>
                      <th scope="col" className={styles.num}>
                        Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d.date}>
                        <td>{shortDate(d.date)}</td>
                        <td>{d.rows.map((r) => `${r.name} ${formatHours(r.hours)}`).join(", ")}</td>
                        <td className={styles.num}>{formatHours(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={2}>
                        Total
                      </th>
                      <td className={styles.num}>
                        <strong>{formatHours(wo.hoursUsed)} hrs</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p className={styles.muted}>
                  By person:{" "}
                  {totalsByPerson(days)
                    .map((p) => `${p.name} ${formatHours(p.hours)}`)
                    .join(" · ")}
                </p>
              </>
            )}
          </>
        )}
      </section>

      <TurnInForm workOrderId={wo.id} defaultName={wo.shipTo.contact} />
    </main>
  );
}
