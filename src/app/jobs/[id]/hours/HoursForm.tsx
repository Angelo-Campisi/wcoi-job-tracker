"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { HoursDay } from "@/lib/hours-data";
import { dailyFlags, hoursChanges, stepHours } from "@/lib/hours-entry";
import { sumHours } from "@/lib/hours";
import { formatHours, shortDate } from "@/lib/my-jobs";
import { addToCrew, removeFromCrew, saveDayHours } from "./actions";
import styles from "./hours.module.css";

export default function HoursForm({
  day,
  today,
  prevDate,
  nextDate,
}: {
  day: HoursDay;
  today: string;
  prevDate: string;
  nextDate: string | null;
}) {
  const router = useRouter();
  const [edited, setEdited] = useState(() => new Map(day.crew.map((c) => [c.employeeId, c.savedHours])));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; dayTotal: number }[] | null>(null);
  const [addId, setAddId] = useState("");
  const [pending, startTransition] = useTransition();
  const confirmRef = useRef<HTMLDivElement>(null);

  // Bring the over-8-hours question into view so it can't be missed.
  useEffect(() => {
    if (confirm) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [confirm]);

  const saved = useMemo(
    () => new Map(day.crew.filter((c) => c.savedHours !== null).map((c) => [c.employeeId, c.savedHours as number])),
    [day.crew],
  );
  const allJobsDay = useMemo(() => new Map(day.crew.map((c) => [c.employeeId, c.allJobsDay])), [day.crew]);
  const changes = hoursChanges(saved, edited);
  const dirty = changes.upserts.length + changes.deletes.length > 0;
  const flagged = new Map(dailyFlags(edited, saved, allJobsDay, day.threshold).map((f) => [f.employeeId, f.dayTotal]));
  const dayTotal = sumHours([...edited.values()].map((h) => h ?? 0));
  const locked = !day.canEdit;

  function setHours(employeeId: string, hours: number | null) {
    setMessage(null);
    setConfirm(null);
    setEdited((current) => new Map(current).set(employeeId, hours));
  }

  function save(confirmed: boolean) {
    startTransition(async () => {
      const result = await saveDayHours({
        workOrderId: day.workOrderId,
        date: day.date,
        hours: Object.fromEntries(edited),
        confirmed,
      });
      if (result.ok) {
        setConfirm(null);
        setMessage({ kind: "ok", text: result.saved === 0 ? "Nothing to save." : "Hours saved." });
        router.refresh();
      } else if ("needsConfirm" in result) {
        setConfirm(result.needsConfirm);
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  function crewChange(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage(null);
        router.refresh();
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  // Leaving with unsaved hours asks first.
  function guard(event: React.MouseEvent) {
    if (dirty && !window.confirm("You have hours that aren't saved. Leave without saving?")) event.preventDefault();
  }

  const quickDates = [...new Set([...day.quickDates.filter((d) => d <= today), today])].sort().slice(-6);

  return (
    <>
      {day.canPickDay ? (
        <>
          <nav className={styles.dateNav} aria-label="Pick a day">
            <Link className={styles.navButton} href={`?date=${prevDate}`} onClick={guard}>
              ← Day before
            </Link>
            <p className={styles.dateLabel}>
              {shortDate(day.date)}
              {day.date === today && <span className={styles.todayTag}>Today</span>}
            </p>
            {nextDate ? (
              <Link className={styles.navButton} href={`?date=${nextDate}`} onClick={guard}>
                Day after →
              </Link>
            ) : (
              <span className={styles.navSpacer} />
            )}
          </nav>
          <div className={styles.quickDates}>
            {quickDates.map((d) => (
              <Link
                key={d}
                href={`?date=${d}`}
                onClick={guard}
                className={d === day.date ? styles.chipCurrent : styles.chip}
                aria-current={d === day.date ? "date" : undefined}
              >
                {d === today ? "Today" : shortDate(d)}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className={styles.dateLabelLeft}>
            {shortDate(day.date)}
            <span className={styles.todayTag}>Today</span>
          </p>
          <p className={styles.hint}>Job leads enter hours for today. Ask the office to change other days.</p>
        </>
      )}

      {locked && (
        <p className={styles.locked} role="status">
          {day.status === "approved" || day.status === "sent"
            ? "These hours have been approved, so they're locked. Undo the approval on the review screen to change them."
            : "This job has been turned in, so hours are locked. Ask the office if something needs fixing."}
        </p>
      )}

      {day.crew.length === 0 ? (
        <p className={styles.muted}>No one is on the crew yet. Add people below.</p>
      ) : (
        <ul className={styles.rows}>
          {day.crew.map((c) => {
            const hours = edited.get(c.employeeId) ?? null;
            const otherJobs = sumHours([c.allJobsDay, -(c.savedHours ?? 0)]);
            const over = flagged.get(c.employeeId);
            return (
              <li key={c.employeeId} className={over ? styles.rowFlagged : styles.row}>
                <div className={styles.who}>
                  <p className={styles.name}>{c.name}</p>
                  <p className={styles.small}>
                    {otherJobs > 0 && <>Other jobs this day: {formatHours(otherJobs)} hrs · </>}
                    This week: {formatHours(c.weekTotal)} hrs
                  </p>
                  {over !== undefined && (
                    <p className={styles.flag}>
                      {formatHours(over)} hrs this day across all jobs (over {formatHours(day.threshold)})
                    </p>
                  )}
                </div>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepButton}
                    onClick={() => setHours(c.employeeId, stepHours(hours, -1))}
                    disabled={locked || pending || hours === null}
                    aria-label={`Less time for ${c.name}`}
                  >
                    −
                  </button>
                  <output className={styles.value} aria-label={`Hours for ${c.name}`}>
                    {hours === null ? "—" : formatHours(hours)}
                  </output>
                  <button
                    type="button"
                    className={styles.stepButton}
                    onClick={() => setHours(c.employeeId, stepHours(hours, 1))}
                    disabled={locked || pending || hours === 24}
                    aria-label={`More time for ${c.name}`}
                  >
                    +
                  </button>
                </div>
                {!locked && !c.hasHoursOnJob && hours === null && (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => crewChange(() => removeFromCrew(day.workOrderId, c.employeeId))}
                    disabled={pending}
                    aria-label={`Remove ${c.name} from the crew`}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!locked && day.crew.length > 0 && <p className={styles.hint}>Tap + to start at 8 hours. Each tap is half an hour.</p>}

      {!locked && day.available.length > 0 && (
        <div className={styles.addCrew}>
          <label htmlFor="add-crew" className={styles.addLabel}>
            Add to crew
          </label>
          <select id="add-crew" className={styles.select} value={addId} onChange={(e) => setAddId(e.target.value)} disabled={pending}>
            <option value="">Pick a person…</option>
            {day.available.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.addButton}
            disabled={!addId || pending}
            onClick={() => {
              const id = addId;
              setAddId("");
              crewChange(() => addToCrew(day.workOrderId, id));
            }}
          >
            Add
          </button>
        </div>
      )}

      {confirm && (
        <div ref={confirmRef} className={styles.confirm} role="alertdialog" aria-labelledby="confirm-title">
          <h2 id="confirm-title" className={styles.confirmTitle}>
            Over {formatHours(day.threshold)} hours in one day
          </h2>
          <ul className={styles.confirmList}>
            {confirm.map((c) => (
              <li key={c.name}>
                {c.name}: {formatHours(c.dayTotal)} hrs across all jobs
              </li>
            ))}
          </ul>
          <p>Check these are right. You can still save.</p>
          <div className={styles.confirmButtons}>
            <button type="button" className={styles.secondary} onClick={() => setConfirm(null)} disabled={pending}>
              Go back
            </button>
            <button type="button" className={styles.primary} onClick={() => save(true)} disabled={pending}>
              Hours are correct, save
            </button>
          </div>
        </div>
      )}

      {!locked && (
        <div className={styles.saveBar}>
          <p className={styles.total}>
            Total this day: <strong>{formatHours(dayTotal)} hrs</strong>
          </p>
          <p className={message?.kind === "error" ? styles.error : styles.ok} role="status">
            {message?.text}
          </p>
          <button type="button" className={styles.primary} onClick={() => save(false)} disabled={!dirty || pending || confirm !== null}>
            {pending ? "Saving…" : "Save hours"}
          </button>
        </div>
      )}
      {locked && message && (
        <p className={styles.error} role="status">
          {message.text}
        </p>
      )}
    </>
  );
}
