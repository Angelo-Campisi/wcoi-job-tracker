import Link from "next/link";
import AppHeader, { SignOutButton } from "@/components/AppHeader";
import { loadJobCards, type JobCard } from "@/lib/jobs-data";
import {
  budgetStatusLabel,
  datesSummary,
  formatHours,
  groupJobs,
  shortDate,
  todayIn,
  WORK_ORDER_STATUS_LABELS,
} from "@/lib/my-jobs";
import { requireSession } from "@/lib/session";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const PAST_JOBS_SHOWN = 20;

// "My jobs" (spec 6.1): today's jobs first, then upcoming and past.
// Leads see only their assigned jobs; the bookkeeper and owner see all jobs.
export default async function MyJobs({ searchParams }: { searchParams: Promise<{ today?: string }> }) {
  const { supabase, me, lockMinutes } = await requireSession();

  // A login with no active app user (e.g. turned off by the office).
  if (!me) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>This sign-in is turned off</h1>
        <p className={styles.empty}>Ask the office. Sign out so someone else can use the tablet.</p>
        <SignOutButton />
      </main>
    );
  }

  const today = await pickToday(searchParams);
  const jobs = await loadJobCards(supabase, me);
  const groups = groupJobs(jobs, today);
  const isStaff = me.role !== "lead";
  const past = groups.past.slice(0, PAST_JOBS_SHOWN);

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} />

      <h1 className={styles.title}>{isStaff ? "All jobs" : "My jobs"}</h1>

      {jobs.length === 0 ? (
        <p className={styles.empty}>
          {isStaff ? "No work orders yet." : "No jobs assigned to you yet. Check with the office."}
        </p>
      ) : (
        <>
          <JobSection
            title={`Today · ${shortDate(today)}`}
            jobs={groups.today}
            today={today}
            isStaff={isStaff}
            emptyText="Nothing scheduled for today."
          />
          <JobSection title="Upcoming" jobs={groups.upcoming} today={today} isStaff={isStaff} />
          {isStaff && <JobSection title="Not scheduled" jobs={groups.unscheduled} today={today} isStaff />}
          <JobSection title="Past" jobs={past} today={today} isStaff={isStaff} />
          {groups.past.length > past.length && (
            <p className={styles.more}>Showing the {PAST_JOBS_SHOWN} most recent past jobs.</p>
          )}
        </>
      )}
    </main>
  );
}

function JobSection({
  title,
  jobs,
  today,
  isStaff,
  emptyText,
}: {
  title: string;
  jobs: JobCard[];
  today: string;
  isStaff: boolean;
  emptyText?: string;
}) {
  if (jobs.length === 0 && !emptyText) return null;
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {jobs.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <ul className={styles.cards}>
          {jobs.map((job) => (
            <li key={job.id}>
              <JobCardView job={job} today={today} isStaff={isStaff} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobCardView({ job, today, isStaff }: { job: JobCard; today: string; isStaff: boolean }) {
  const status = job.budget ? budgetStatusLabel(job.budget.status) : null;
  const percent = job.budget?.percentUsed ?? (job.budget && job.hoursUsed > 0 ? 100 : 0);
  return (
    <Link href={`/jobs/${job.id}`} className={styles.card}>
      <div className={styles.cardTop}>
        <h3 className={styles.customer}>{job.customer || "No customer name"}</h3>
        <span className={job.jobType === "quoted" ? styles.typeQuoted : styles.typeHourly}>
          {job.jobType === "quoted" ? "Quoted" : "Hourly"}
        </span>
      </div>
      <p className={styles.address}>{job.address}</p>
      <p className={styles.meta}>
        {[job.quoteNumber && `Quote ${job.quoteNumber}`, job.poNumber && `PO ${job.poNumber}`]
          .filter(Boolean)
          .join(" · ")}
        {job.status !== "open" && <span className={styles.status}>{WORK_ORDER_STATUS_LABELS[job.status]}</span>}
      </p>
      {job.dates.length > 0 && <p className={styles.dates}>{datesSummary(job.dates, today)}</p>}
      {isStaff && job.leads.length > 0 && <p className={styles.meta}>Lead: {job.leads.join(", ")}</p>}

      {job.budget && status ? (
        <div className={styles.budget}>
          <div className={styles.budgetText}>
            <span>
              {formatHours(job.budget.hoursUsed)} of {formatHours(job.budget.budgetHours)} hrs used
            </span>
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
        </div>
      ) : (
        <p className={styles.meta}>{formatHours(job.hoursUsed)} hrs entered</p>
      )}

      {job.pendingChangeOrders > 0 && (
        <p className={styles.pending}>
          {job.pendingChangeOrders === 1
            ? "1 change order waiting for owner approval"
            : `${job.pendingChangeOrders} change orders waiting for owner approval`}
        </p>
      )}
    </Link>
  );
}

// Today in the company's time zone. In development, ?today=YYYY-MM-DD can
// stand in for today so the fake November jobs can be checked.
async function pickToday(searchParams: Promise<{ today?: string }>): Promise<string> {
  const { today } = await searchParams;
  if (process.env.NODE_ENV !== "production" && today && /^\d{4}-\d{2}-\d{2}$/.test(today)) return today;
  return todayIn(process.env.COMPANY_TIME_ZONE || "America/Chicago");
}
