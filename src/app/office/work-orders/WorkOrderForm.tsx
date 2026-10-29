"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WorkOrderFormInput } from "@/lib/office-forms";
import { deleteWorkOrder, saveWorkOrder } from "./actions";
import styles from "../office.module.css";

type Line = WorkOrderFormInput["lines"][number];

const blankLine = (): Line => ({ description: "", quantity: "", isLabor: true });

// Work order entry (spec 6.1 "manual work order entry"). Labor lines carry budget
// hours; a job with labor hours is quoted, otherwise hourly, unless overridden.
export default function WorkOrderForm({
  id,
  initial,
  canDelete,
  locked,
}: {
  id: string | null;
  initial: WorkOrderFormInput;
  canDelete: boolean;
  /** Approved jobs: line items are locked. */
  locked: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<WorkOrderFormInput>({
    ...initial,
    lines: initial.lines.length ? initial.lines : [blankLine()],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof WorkOrderFormInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const setLine = (i: number, patch: Partial<Line>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const laborHours = form.lines
    .filter((l) => l.isLabor)
    .reduce((t, l) => t + (Number(l.quantity.replace(",", ".")) || 0), 0);
  const autoType = laborHours > 0 ? "quoted" : "hourly";

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveWorkOrder(id, form);
      if (result.ok) {
        router.push(`/jobs/${result.id}`);
      } else {
        setErrors(result.errors);
        setMessage(result.error ?? null);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteWorkOrder(id!);
      if (result.ok) router.push("/");
      else {
        setConfirmDelete(false);
        setMessage(result.error);
      }
    });
  }

  const field = (key: keyof WorkOrderFormInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`wo-${key}`}>
        {label}
      </label>
      <input
        id={`wo-${key}`}
        className={errors[key] ? `${styles.input} ${styles.inputError}` : styles.input}
        value={form[key] as string}
        onChange={set(key)}
        disabled={pending}
        aria-invalid={Boolean(errors[key])}
        {...props}
      />
      {errors[key] && <span className={styles.fieldError}>{errors[key]}</span>}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <section className={styles.section} aria-label="Job">
        <h2 className={styles.sectionTitle}>Job</h2>
        <div className={styles.grid2}>
          {field("orderDate", "Order date", { type: "date" })}
          {field("quoteNumber", "Quote number")}
          {field("poNumber", "PO number")}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wo-jobTypeOverride">
              Job type
            </label>
            <select id="wo-jobTypeOverride" className={styles.select} value={form.jobTypeOverride} onChange={set("jobTypeOverride")} disabled={pending}>
              <option value="">Automatic ({autoType === "quoted" ? "Quoted" : "Hourly"})</option>
              <option value="quoted">Quoted</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-label="Ship to">
        <h2 className={styles.sectionTitle}>Ship to (job site)</h2>
        <div className={styles.grid2}>
          {field("shipToCompany", "Customer / company")}
          {field("shipToAddress", "Address")}
          {field("shipToContact", "On-site contact")}
          {field("shipToPhone", "On-site phone", { type: "tel", inputMode: "tel" })}
        </div>
      </section>

      <section className={styles.section} aria-label="Bill to">
        <h2 className={styles.sectionTitle}>Bill to</h2>
        <div className={styles.grid2}>
          {field("billToCompany", "Company")}
          {field("billToContact", "Contact")}
          {field("billToPhone", "Phone", { type: "tel", inputMode: "tel" })}
        </div>
      </section>

      <section className={styles.section} aria-label="Line items">
        <h2 className={styles.sectionTitle}>Line items</h2>
        <p className={styles.muted}>
          For labor lines, the quantity is the budgeted hours. Leave labor quantity at 0 for an hourly job.
        </p>
        {locked && <p className={styles.fieldError}>This job is approved, so line items are locked. Undo the approval to change them.</p>}
        <div className={styles.lines}>
          {form.lines.map((l, i) => (
            <div key={i} className={styles.lineRow}>
              <input
                className={errors[`line${i}`] ? `${styles.input} ${styles.inputError}` : styles.input}
                aria-label={`Line ${i + 1} description`}
                placeholder="Description"
                value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                disabled={pending || locked}
              />
              <input
                className={styles.input}
                aria-label={`Line ${i + 1} ${l.isLabor ? "hours" : "quantity"}`}
                placeholder={l.isLabor ? "Hours" : "Qty"}
                inputMode="decimal"
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                disabled={pending || locked}
              />
              <label className={styles.check}>
                <input type="checkbox" checked={l.isLabor} onChange={(e) => setLine(i, { isLabor: e.target.checked })} disabled={pending || locked} />
                Labor
              </label>
              <button
                type="button"
                className={styles.small}
                onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}
                disabled={pending || locked}
                aria-label={`Remove line ${i + 1}`}
              >
                Remove
              </button>
              {errors[`line${i}`] && <span className={styles.fieldError}>{errors[`line${i}`]}</span>}
            </div>
          ))}
        </div>
        <div>
          <button type="button" className={styles.secondary} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }))} disabled={pending || locked}>
            Add line
          </button>
        </div>
        <p>
          Budget: <strong>{Math.round(laborHours * 100) / 100} hrs</strong> of labor
        </p>
      </section>

      <section className={styles.section} aria-label="Notes">
        <h2 className={styles.sectionTitle}>Special instructions</h2>
        <textarea
          className={styles.textarea}
          rows={3}
          aria-label="Special instructions"
          placeholder="For example: use the freight elevator, badge in at the front desk"
          value={form.notes}
          onChange={set("notes")}
          disabled={pending}
        />
        {errors.notes && <span className={styles.fieldError}>{errors.notes}</span>}
      </section>

      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}

      {confirmDelete ? (
        <div className={styles.box} role="alertdialog" aria-labelledby="del-q">
          <p id="del-q">
            <strong>Delete this work order?</strong> This can&apos;t be undone.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setConfirmDelete(false)} disabled={pending}>
              Keep it
            </button>
            <button type="button" className={styles.danger} onClick={remove} disabled={pending}>
              Yes, delete
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          {canDelete && (
            <button type="button" className={styles.danger} onClick={() => setConfirmDelete(true)} disabled={pending}>
              Delete
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={() => router.back()} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? "Saving…" : id ? "Save changes" : "Create work order"}
          </button>
        </div>
      )}
    </form>
  );
}
