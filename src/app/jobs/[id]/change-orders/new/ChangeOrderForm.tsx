"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  changeOrderPreview,
  changeOrderProblem,
  MAX_DESCRIPTION,
  parseHours,
  stepChangeHours,
} from "@/lib/change-order-form";
import { formatHours } from "@/lib/my-jobs";
import { createChangeOrder } from "../actions";
import styles from "../change-orders.module.css";

export default function ChangeOrderForm({
  workOrderId,
  thresholdHours,
  isHourlyJob,
}: {
  workOrderId: string;
  thresholdHours: number;
  isHourlyJob: boolean;
}) {
  const router = useRouter();
  const [hoursText, setHoursText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hours = parseHours(hoursText);
  const preview = changeOrderPreview(hours, thresholdHours, isHourlyJob);

  function step(direction: 1 | -1) {
    setError(null);
    const next = stepChangeHours(hours, direction);
    setHoursText(next === null ? "" : formatHours(next));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = changeOrderProblem(hours, description);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      const result = await createChangeOrder(workOrderId, hours!, description);
      if (result.ok) router.push(`/jobs/${workOrderId}?co=${result.type}`);
      else setError(result.error);
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="co-hours" className={styles.label}>
        Extra hours
      </label>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepButton}
          onClick={() => step(-1)}
          disabled={pending || hours === null}
          aria-label="Fewer hours"
        >
          −
        </button>
        <input
          id="co-hours"
          className={styles.hoursInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={hoursText}
          onChange={(e) => {
            setError(null);
            setHoursText(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5));
          }}
          disabled={pending}
        />
        <button type="button" className={styles.stepButton} onClick={() => step(1)} disabled={pending} aria-label="More hours">
          +
        </button>
        <span className={styles.unit}>hrs</span>
      </div>

      <p className={preview.type === "large" ? styles.previewLarge : styles.preview} role="status">
        {preview.text}
      </p>

      <label htmlFor="co-description" className={styles.label}>
        What changed?
      </label>
      <textarea
        id="co-description"
        className={styles.textarea}
        rows={4}
        maxLength={MAX_DESCRIPTION}
        placeholder="For example: customer added two more desks in room 210"
        value={description}
        onChange={(e) => {
          setError(null);
          setDescription(e.target.value);
        }}
        disabled={pending}
      />

      <p className={styles.error} role="alert">
        {error}
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => router.back()} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "Sending…" : preview.type === "large" ? "Send to owner" : "Add change order"}
        </button>
      </div>
    </form>
  );
}
