"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPerson } from "./actions";
import styles from "../office.module.css";

export default function AddPersonForm({ isOwner, today }: { isOwner: boolean; today: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [wage, setWage] = useState("");
  const [wageFrom, setWageFrom] = useState(today);
  const [role, setRole] = useState<"" | "lead" | "bookkeeper" | "owner">("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPerson({ name, wage, wageFrom, role, pin });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/office/people/${result.id}${result.warning ? `?warning=${encodeURIComponent(result.warning)}` : ""}`);
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-name">
            Name
          </label>
          <input id="p-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={pending} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-wage">
            Hourly wage
          </label>
          <input id="p-wage" className={styles.input} inputMode="decimal" placeholder="22.50" value={wage} onChange={(e) => setWage(e.target.value)} disabled={pending} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-wage-from">
            Wage starts
          </label>
          <input id="p-wage-from" type="date" className={styles.input} value={wageFrom} onChange={(e) => setWageFrom(e.target.value)} disabled={pending} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="p-role">
            Sign-in
          </label>
          <select id="p-role" className={styles.select} value={role} onChange={(e) => setRole(e.target.value as typeof role)} disabled={pending}>
            <option value="">None (crew member)</option>
            <option value="lead">Job lead</option>
            <option value="bookkeeper">Bookkeeper</option>
            {isOwner && <option value="owner">Owner</option>}
          </select>
        </div>
        {role !== "" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="p-pin">
              PIN (6 digits)
            </label>
            <input
              id="p-pin"
              className={styles.input}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={pending}
            />
          </div>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}
