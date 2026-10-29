"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCrew, removeFromCrew } from "@/app/jobs/[id]/hours/actions";
import { shortDate } from "@/lib/my-jobs";
import { addLead, addLeadDate, removeLead, removeLeadDate } from "../../actions";
import styles from "../../../office.module.css";

type Result = { ok: true } | { ok: false; error: string };

export default function ScheduleForm({
  workOrderId,
  assignments,
  leadChoices,
  crew,
  crewChoices,
}: {
  workOrderId: string;
  assignments: { id: string; leadUserId: string; name: string; dates: string[] }[];
  leadChoices: { id: string; name: string; role: string }[];
  crew: { employeeId: string; name: string; hasHours: boolean }[];
  crewChoices: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newLead, setNewLead] = useState("");
  const [newCrew, setNewCrew] = useState("");
  const [newDates, setNewDates] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<Result>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(null);
        after?.();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <section className={styles.section} aria-label="Leads and days">
        <h2 className={styles.sectionTitle}>Leads and days</h2>
        {assignments.length === 0 && <p className={styles.muted}>No lead yet. Add one below; they&apos;ll see this job on their tablet.</p>}
        <div className={styles.lines}>
          {assignments.map((a) => (
            <div key={a.id} className={styles.box}>
              <div className={styles.row}>
                <strong>{a.name}</strong>
                <button
                  type="button"
                  className={styles.small}
                  onClick={() => {
                    if (window.confirm(`Take ${a.name} off this job? Their days on it are removed too.`)) {
                      run(() => removeLead(workOrderId, a.id));
                    }
                  }}
                  disabled={pending}
                >
                  Remove lead
                </button>
              </div>
              <div className={styles.chips} style={{ marginTop: 10 }}>
                {a.dates.length === 0 && <span className={styles.muted}>No days yet.</span>}
                {a.dates.map((d) => (
                  <span key={d} className={styles.chip}>
                    {shortDate(d)}
                    <button
                      type="button"
                      className={styles.chipX}
                      aria-label={`Remove ${shortDate(d)} for ${a.name}`}
                      onClick={() => run(() => removeLeadDate(workOrderId, a.id, d))}
                      disabled={pending}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className={styles.inline} style={{ marginTop: 12 }}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`date-${a.id}`}>
                    Add a day
                  </label>
                  <input
                    id={`date-${a.id}`}
                    type="date"
                    className={styles.input}
                    value={newDates[a.id] ?? ""}
                    onChange={(e) => setNewDates((m) => ({ ...m, [a.id]: e.target.value }))}
                    disabled={pending}
                  />
                </div>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pending || !newDates[a.id]}
                  onClick={() =>
                    run(
                      () => addLeadDate(workOrderId, a.id, newDates[a.id]),
                      () => setNewDates((m) => ({ ...m, [a.id]: "" })),
                    )
                  }
                >
                  Add day
                </button>
              </div>
            </div>
          ))}
        </div>
        {leadChoices.length > 0 && (
          <div className={styles.inline} style={{ marginTop: 16 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-lead">
                Add a lead
              </label>
              <select id="new-lead" className={styles.select} value={newLead} onChange={(e) => setNewLead(e.target.value)} disabled={pending}>
                <option value="">Pick a person…</option>
                {leadChoices.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.role !== "lead" ? ` (${u.role})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.primary}
              disabled={pending || !newLead}
              onClick={() => run(() => addLead(workOrderId, newLead), () => setNewLead(""))}
            >
              Add lead
            </button>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="Crew">
        <h2 className={styles.sectionTitle}>Crew</h2>
        <p className={styles.muted}>Leads can also add or remove crew on their tablet while the job is open.</p>
        <div className={styles.chips} style={{ marginTop: 10 }}>
          {crew.length === 0 && <span className={styles.muted}>No crew yet.</span>}
          {crew.map((c) => (
            <span key={c.employeeId} className={styles.chip}>
              {c.name}
              {c.hasHours ? (
                <span className={styles.muted} style={{ padding: "0 8px", fontSize: "0.9rem" }}>
                  has hours
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.chipX}
                  aria-label={`Remove ${c.name} from the crew`}
                  onClick={() => run(() => removeFromCrew(workOrderId, c.employeeId))}
                  disabled={pending}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {crewChoices.length > 0 && (
          <div className={styles.inline} style={{ marginTop: 16 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-crew">
                Add to crew
              </label>
              <select id="new-crew" className={styles.select} value={newCrew} onChange={(e) => setNewCrew(e.target.value)} disabled={pending}>
                <option value="">Pick a person…</option>
                {crewChoices.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.primary}
              disabled={pending || !newCrew}
              onClick={() => run(() => addToCrew(workOrderId, newCrew), () => setNewCrew(""))}
            >
              Add
            </button>
          </div>
        )}
      </section>
    </>
  );
}
