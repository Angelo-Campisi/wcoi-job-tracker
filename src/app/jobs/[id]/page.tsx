import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { formatDollars } from "@/lib/labor-cost";
import { COMPANY_TIME_ZONE, companyToday } from "@/lib/company-time";
import { budgetStatusLabel, datesSummary, formatHours, shortDate } from "@/lib/my-jobs";
import { requireSession } from "@/lib/session";
import { loadWorkOrder, type WorkOrderDetail } from "@/lib/work-order-data";
import { statusSteps, telHref } from "@/lib/work-order-view";
import DecideButtons from "./change-orders/DecideButtons";
import styles from "./work-order.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Work order · WCOI Job Tracker" };


// Work order screen (spec 6.2): everything about one job in one place.
// What each person sees is decided by the database: leads only open their own
// jobs, and only the bookkeeper and owner get labor cost.
export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ co?: string; turnedIn?: string }>;
}) {
  const [{ id }, { co: justSubmitted, turnedIn: justTurnedIn }] = await Promise.all([params, searchParams]);
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
  // Missing, or not this person's job: same answer either way.
  if (!wo) notFound();

  const isStaff = me.role !== "lead";
  const isOwner = me.role === "owner";
  // Approved (or sent) jobs are locked for everyone until the approval is undone.
  const approvedLock = wo.status === "approved" || wo.status === "sent";
  const canChange = !approvedLock && (isStaff || wo.status === "open");
  const today = companyToday();

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/" backLabel={isStaff ? "All jobs" : "My jobs"} />

      <section className={styles.top}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{wo.shipTo.company || wo.billTo.company || "Work order"}</h1>
          <span className={wo.jobType === "quoted" ? styles.typeQuoted : styles.typeHourly}>
            {wo.jobType === "quoted" ? "Quoted" : "Hourly"}
          </span>
        </div>
        {wo.shipTo.address && (
          <p className={styles.address}>
            {wo.shipTo.address}{" "}
            <a className={styles.link} href={`https://maps.apple.com/?q=${encodeURIComponent(wo.shipTo.address)}`}>
              Directions
            </a>
          </p>
        )}
        <StatusSteps status={wo.status} />
        {isStaff && (
          <div className={styles.officeLinks}>
            <Link href={`/office/work-orders/${wo.id}/edit`} className={styles.officeLink}>
              Edit work order
            </Link>
            <Link href={`/office/work-orders/${wo.id}/schedule`} className={styles.officeLink}>
              Leads, days &amp; crew
            </Link>
          </div>
        )}
      </section>

      {justSubmitted === "quick" && (
        <p className={styles.banner} role="status">
          Change order added{wo.budget ? ". The budget now includes it." : "."}
        </p>
      )}
      {justTurnedIn === "1" && wo.status === "turned_in" && (
        <p className={styles.banner} role="status">
          Work order turned in. Hours are now locked for the job lead.
        </p>
      )}
      {justSubmitted === "large" && (
        <p className={styles.banner} role="status">
          Change order sent to the owner for approval. The budget changes once it&apos;s approved.
        </p>
      )}

      {wo.notes && (
        <section className={styles.notes} aria-label="Special instructions">
          <h2 className={styles.notesTitle}>Special instructions</h2>
          <p>{wo.notes}</p>
        </section>
      )}

      <Contacts wo={wo} />

      <Budget wo={wo} isStaff={isStaff} />

      <Section title="Hours">
        {canChange ? (
          <Link href={`/jobs/${wo.id}/hours`} className={styles.enterHours}>
            {isStaff ? "Enter hours" : "Enter today's hours"}
          </Link>
        ) : (
          <p className={styles.lockedNote}>
            {approvedLock
              ? "Approved: hours are locked. Undo the approval on the review screen to change them."
              : "Turned in: hours are locked. Ask the office if something needs fixing."}
          </p>
        )}
        {wo.hoursDays.length === 0 ? (
          <p className={styles.muted}>No hours entered yet.</p>
        ) : (
          wo.hoursDays.map((day) => (
            <div key={day.date} className={styles.day}>
              <h3 className={styles.dayTitle}>
                {isStaff ? (
                  <Link href={`/jobs/${wo.id}/hours?date=${day.date}`} className={styles.dayLink}>
                    {shortDate(day.date)}
                  </Link>
                ) : (
                  <span>{shortDate(day.date)}</span>
                )}
                <span>{formatHours(day.total)} hrs</span>
              </h3>
              <ul className={styles.rows}>
                {day.rows.map((r) => (
                  <li key={r.employeeId} className={styles.row}>
                    <span>{r.name}</span>
                    <span className={styles.rowHours}>
                      {formatHours(r.hours)} hrs
                      {r.flagged && (
                        <span className={styles.flag}>
                          {formatHours(r.dayTotalAllJobs)} hrs that day across all jobs (over{" "}
                          {formatHours(wo.dailyThreshold)})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Section>

      <Section title="Change orders">
        {canChange && (
          <Link href={`/jobs/${wo.id}/change-orders/new`} className={styles.secondaryButton}>
            New change order
          </Link>
        )}
        {wo.changeOrders.length === 0 ? (
          <p className={styles.muted}>No change orders.</p>
        ) : (
          <ul className={styles.list}>
            {wo.changeOrders.map((c) => (
              <li key={c.id} className={styles.changeOrder}>
                <div className={styles.changeTop}>
                  <strong>
                    +{formatHours(c.hoursAdded)} hrs · {c.type === "quick" ? "Quick" : "Large"}
                  </strong>
                  <span className={styles[`co_${c.status}`]}>{CHANGE_STATUS[c.status]}</span>
                </div>
                <p>{c.description}</p>
                <p className={styles.muted}>
                  {c.requestedBy ? `${c.requestedBy}, ` : ""}
                  {formatDateTime(c.requestedAt)}
                  {c.type === "large" && c.decidedAt && (
                    <>
                      {" · "}
                      {c.status === "approved" ? "Approved" : "Denied"}
                      {c.decidedBy ? ` by ${c.decidedBy}` : ""} {formatDateTime(c.decidedAt)}
                    </>
                  )}
                </p>
                {isOwner && c.status === "pending" && (
                  <DecideButtons changeOrderId={c.id} hoursLabel={`+${formatHours(c.hoursAdded)} hrs`} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Line items">
        <ul className={styles.list}>
          {wo.lines.map((l) => (
            <li key={l.lineNumber} className={styles.row}>
              <span>
                {l.description}
                {!l.isLabor && <span className={styles.tag}>Not labor</span>}
              </span>
              <span className={styles.rowHours}>
                {l.isLabor ? (l.quantity > 0 ? `${formatHours(l.quantity)} hrs` : "Hourly") : `Qty ${formatHours(l.quantity)}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Job details">
        <dl className={styles.details}>
          <Detail label="Quote" value={wo.quoteNumber} />
          <Detail label="PO" value={wo.poNumber} />
          <Detail label="Order date" value={shortDate(wo.orderDate)} />
          <Detail label={isStaff ? "Scheduled" : "Your days"} value={wo.dates.length ? datesSummary(wo.dates, today, 6) : "Not scheduled"} />
          <Detail label={wo.leads.length > 1 ? "Leads" : "Lead"} value={wo.leads.join(", ") || "None yet"} />
          <Detail label="Crew" value={wo.crew.join(", ") || "None yet"} />
        </dl>
      </Section>

      <Section title="Turn-in">
        {wo.turnIn.at ? (
          <>
            <p>
              Turned in {formatDateTime(wo.turnIn.at)}
              {wo.turnIn.by ? ` by ${wo.turnIn.by}` : ""}.
            </p>
            {wo.turnIn.signature ? (
              <figure className={styles.signature}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a saved data URL, not a file to optimize */}
                <img src={wo.turnIn.signature} alt={`Signature of ${wo.turnIn.signedName ?? "the customer"}`} />
                <figcaption>Signed by {wo.turnIn.signedName}</figcaption>
              </figure>
            ) : wo.turnIn.note ? (
              <p className={styles.lockedNote}>No customer signature: {wo.turnIn.note}</p>
            ) : (
              wo.turnIn.signedName && <p>Signed by {wo.turnIn.signedName}.</p>
            )}
            {wo.approval.at && (
              <p className={styles.approved}>
                Hours approved {formatDateTime(wo.approval.at)}
                {wo.approval.by ? ` by ${wo.approval.by}` : ""}.
              </p>
            )}
            {isStaff && (wo.status === "turned_in" || wo.status === "approved") && (
              <Link href={`/review/${wo.id}`} className={styles.enterHours}>
                {wo.status === "turned_in" ? "Review hours" : "Open review"}
              </Link>
            )}
          </>
        ) : canChange ? (
          <>
            <p className={styles.muted}>When the job is done, get the customer&apos;s signature and turn it in.</p>
            <Link href={`/jobs/${wo.id}/turn-in`} className={styles.enterHours}>
              Turn in work order
            </Link>
          </>
        ) : (
          <p className={styles.muted}>Not turned in yet.</p>
        )}
      </Section>

      <p className={styles.later}>Documents, photos, and the punch list arrive in Phase 2.</p>
    </main>
  );
}

const CHANGE_STATUS = { pending: "Waiting for owner", approved: "Approved", denied: "Denied" } as const;

function StatusSteps({ status }: { status: WorkOrderDetail["status"] }) {
  return (
    <ol className={styles.steps} aria-label="Job status">
      {statusSteps(status).map((s) => (
        <li key={s.label} className={styles[`step_${s.state}`]} aria-current={s.state === "current" ? "step" : undefined}>
          {s.state === "done" ? "✓ " : ""}
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function Contacts({ wo }: { wo: WorkOrderDetail }) {
  const onSiteCall = telHref(wo.shipTo.phone);
  const billCall = telHref(wo.billTo.phone);
  return (
    <Section title="Contacts">
      <div className={styles.onSite}>
        <p className={styles.label}>On-site contact</p>
        <p className={styles.contactName}>{wo.shipTo.contact || "No on-site contact listed"}</p>
        {onSiteCall && (
          <a className={styles.call} href={onSiteCall}>
            Call {wo.shipTo.phone}
          </a>
        )}
      </div>
      <div className={styles.billTo}>
        <p className={styles.label}>Bill to</p>
        <p>
          <strong>{wo.billTo.company}</strong>
          {wo.billTo.contact ? ` · ${wo.billTo.contact}` : ""}
        </p>
        {billCall && (
          <a className={styles.link} href={billCall}>
            Call {wo.billTo.phone}
          </a>
        )}
      </div>
    </Section>
  );
}

function Budget({ wo, isStaff }: { wo: WorkOrderDetail; isStaff: boolean }) {
  const cost = wo.laborCost;
  if (!wo.budget) {
    return (
      <Section title="Hours total">
        <p className={styles.big}>{formatHours(wo.hoursUsed)} hrs</p>
        <p className={styles.muted}>Hourly job: billed for actual hours. No budget.</p>
        {isStaff && cost && <LaborCost cost={cost} />}
      </Section>
    );
  }
  const b = wo.budget;
  const status = budgetStatusLabel(b.status);
  const percent = b.percentUsed ?? (b.hoursUsed > 0 ? 100 : 0);
  return (
    <Section title="Budget">
      <div className={styles.budgetTop}>
        <p className={styles.big}>
          {formatHours(b.hoursUsed)} of {formatHours(b.budgetHours)} hrs
        </p>
        <span className={styles[`tone_${status.tone}`]}>{status.label}</span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label="Budget hours used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(percent, 100))}
      >
        <div className={styles[`fill_${status.tone}`]} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className={styles.budgetLine}>
        {b.hoursRemaining >= 0
          ? `${formatHours(b.hoursRemaining)} hrs left`
          : `${formatHours(-b.hoursRemaining)} hrs over budget`}
        {" · "}
        Quote {formatHours(b.originalHours)} hrs
        {b.changeOrderHours > 0 ? ` + ${formatHours(b.changeOrderHours)} hrs approved changes` : ""}
      </p>
      {isStaff && cost && <LaborCost cost={cost} />}
    </Section>
  );
}

// Bookkeeper and owner only (spec 6.4). Leads never receive this data.
function LaborCost({ cost }: { cost: NonNullable<WorkOrderDetail["laborCost"]> }) {
  return (
    <div className={styles.cost}>
      <p>
        Labor cost so far: <strong>{formatDollars(cost.totalCents)}</strong>
      </p>
      {cost.missingWage.length > 0 && (
        <p className={styles.costWarn}>
          {cost.missingWage.length === 1 ? "1 hours entry has" : `${cost.missingWage.length} hours entries have`} no
          wage on file and {cost.missingWage.length === 1 ? "is" : "are"} not counted.
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
