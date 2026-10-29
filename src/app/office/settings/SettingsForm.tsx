"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SettingsInput } from "@/lib/office-forms";
import { saveSettings } from "./actions";
import styles from "../office.module.css";

const FIELDS: { key: keyof SettingsInput; label: string; help: string; unit: string }[] = [
  { key: "dailyHoursThreshold", label: "Daily hours warning", help: "Warn when one person's hours in a day, across all jobs, go above this.", unit: "hrs" },
  { key: "largeChangeOrderThresholdHours", label: "Large change order", help: "Change orders above this need the owner's approval. At or below, they're quick.", unit: "hrs" },
  { key: "inactivityLockMinutes", label: "Screen lock", help: "Sign the tablet out after this long with no use.", unit: "min" },
  { key: "pinMaxAttempts", label: "Wrong PIN tries", help: "Wrong PINs allowed on one tablet before it's blocked.", unit: "tries" },
  { key: "pinLockoutMinutes", label: "Tablet lockout", help: "How long a tablet stays blocked after too many wrong PINs.", unit: "min" },
  { key: "pinFailuresPerHourLimit", label: "Wrong PINs per hour (all tablets)", help: "Above this, PIN sign-in pauses everywhere until the hour passes.", unit: "per hr" },
];

export default function SettingsForm({ initial }: { initial: SettingsInput }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveSettings(form);
      if (result.ok) {
        setErrors({});
        setMessage({ ok: true, text: "Settings saved." });
        router.refresh();
      } else {
        setErrors(result.errors);
        setMessage({ ok: false, text: result.error ?? "Couldn't save." });
      }
    });
  }

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <div className={styles.grid2} style={{ marginTop: 20 }}>
        {FIELDS.map((f) => (
          <div key={f.key} className={styles.field}>
            <label className={styles.label} htmlFor={`s-${f.key}`}>
              {f.label} ({f.unit})
            </label>
            <input
              id={`s-${f.key}`}
              className={errors[f.key] ? `${styles.input} ${styles.inputError}` : styles.input}
              inputMode="decimal"
              value={form[f.key]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              disabled={pending}
            />
            <span className={styles.muted} style={{ fontSize: "1rem" }}>
              {f.help}
            </span>
            {errors[f.key] && <span className={styles.fieldError}>{errors[f.key]}</span>}
          </div>
        ))}
      </div>
      {message && (
        <p className={message.ok ? styles.ok : styles.error} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
