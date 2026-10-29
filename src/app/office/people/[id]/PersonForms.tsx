"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDate } from "@/lib/my-jobs";
import { addWage, deleteWage, giveSignIn, setPin, updateEmployee, updateSignIn, type PeopleResult } from "../actions";
import styles from "../../office.module.css";

type Role = "lead" | "bookkeeper" | "owner";

export default function PersonForms({
  today,
  isOwner,
  isSelf,
  employee,
  wages,
  signIn,
}: {
  today: string;
  isOwner: boolean;
  isSelf: boolean;
  employee: { id: string; name: string; active: boolean };
  wages: { id: string; wage: number; from: string }[];
  signIn: { id: string; role: Role; active: boolean } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ where: string; ok: boolean; text: string } | null>(null);

  const [name, setName] = useState(employee.name);
  const [active, setActive] = useState(employee.active);
  const [wage, setWage] = useState("");
  const [wageFrom, setWageFrom] = useState(today);
  const [role, setRole] = useState<Role>(signIn?.role ?? "lead");
  const [signInActive, setSignInActive] = useState(signIn?.active ?? true);
  const [pin, setPinText] = useState("");

  // The bookkeeper can't touch an owner's sign-in (database rule); show it read-only.
  const ownerLocked = signIn?.role === "owner" && !isOwner;

  function run(where: string, action: () => Promise<PeopleResult>, okText: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setStatus({ where, ok: true, text: okText });
        after?.();
        // Drop a leftover "saved, but…" warning from the address once things are fixed.
        if (window.location.search) router.replace(window.location.pathname);
        else router.refresh();
      } else {
        setStatus({ where, ok: false, text: result.error });
      }
    });
  }

  const note = (where: string) =>
    status?.where === where ? (
      <p className={status.ok ? styles.ok : styles.error} role={status.ok ? "status" : "alert"}>
        {status.text}
      </p>
    ) : null;

  const pinInput = (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="pin">
        {signIn ? "New PIN (6 digits)" : "PIN (6 digits)"}
      </label>
      <input
        id="pin"
        className={styles.input}
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPinText(e.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={pending || ownerLocked}
      />
    </div>
  );

  return (
    <>
      <section className={styles.section} aria-label="Details">
        <h2 className={styles.sectionTitle}>Details</h2>
        <div className={styles.inline}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Name
            </label>
            <input id="name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={pending || isSelf} />
            Still working here
          </label>
          <button type="button" className={styles.primary} disabled={pending} onClick={() => run("details", () => updateEmployee(employee.id, name, active), "Saved.")}>
            Save
          </button>
        </div>
        {!active && employee.active && <p className={styles.muted}>Turning someone off also turns off their sign-in.</p>}
        {note("details")}
      </section>

      <section className={styles.section} aria-label="Wages">
        <h2 className={styles.sectionTitle}>Wages</h2>
        <p className={styles.muted}>A raise gets a new line with its start date, so past labor cost stays the same.</p>
        <ul className={styles.list}>
          {wages.length === 0 && <li className={styles.fieldError}>No wage on file. Their hours won&apos;t count in labor cost.</li>}
          {wages.map((w) => (
            <li key={w.id} className={styles.row}>
              <span>
                <strong>${w.wage.toFixed(2)}/hr</strong> from {shortDate(w.from)}
                {w.from > today && <span className={styles.tag}>Upcoming</span>}
              </span>
              <button
                type="button"
                className={styles.small}
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Remove the $${w.wage.toFixed(2)} wage from ${shortDate(w.from)}?`)) run("wages", () => deleteWage(w.id), "Removed.");
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.inline} style={{ marginTop: 12 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wage">
              Hourly wage
            </label>
            <input id="wage" className={styles.input} inputMode="decimal" placeholder="22.50" value={wage} onChange={(e) => setWage(e.target.value)} disabled={pending} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wage-from">
              Starts
            </label>
            <input id="wage-from" type="date" className={styles.input} value={wageFrom} onChange={(e) => setWageFrom(e.target.value)} disabled={pending} />
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={pending || !wage}
            onClick={() => run("wages", () => addWage(employee.id, wage, wageFrom), "Wage added.", () => setWage(""))}
          >
            Add wage
          </button>
        </div>
        {note("wages")}
      </section>

      <section className={styles.section} aria-label="Sign-in">
        <h2 className={styles.sectionTitle}>Sign-in</h2>
        {!signIn ? (
          <>
            <p className={styles.muted}>Crew members don&apos;t need a sign-in. Give one to job leads and office staff.</p>
            <div className={styles.inline}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="role">
                  Type
                </label>
                <select id="role" className={styles.select} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={pending}>
                  <option value="lead">Job lead</option>
                  <option value="bookkeeper">Bookkeeper</option>
                  {isOwner && <option value="owner">Owner</option>}
                </select>
              </div>
              {pinInput}
              <button
                type="button"
                className={styles.primary}
                disabled={pending || pin.length !== 6 || !employee.active}
                onClick={() => run("signin", () => giveSignIn(employee.id, role, pin), "Sign-in created.", () => setPinText(""))}
              >
                Give sign-in
              </button>
            </div>
            {!employee.active && <p className={styles.muted}>Turn this person back on first.</p>}
          </>
        ) : ownerLocked ? (
          <p className={styles.muted}>Owner sign-in{signIn.active ? "" : " (off)"}. Only the owner can change it.</p>
        ) : (
          <>
            <div className={styles.inline}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="role">
                  Type
                </label>
                <select id="role" className={styles.select} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={pending || isSelf}>
                  <option value="lead">Job lead</option>
                  <option value="bookkeeper">Bookkeeper</option>
                  {isOwner && <option value="owner">Owner</option>}
                </select>
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={signInActive} onChange={(e) => setSignInActive(e.target.checked)} disabled={pending || isSelf} />
                Can sign in
              </label>
              <button
                type="button"
                className={styles.primary}
                disabled={pending || isSelf}
                onClick={() => run("signin", () => updateSignIn(signIn.id, role, signInActive), "Saved.")}
              >
                Save
              </button>
            </div>
            {isSelf && <p className={styles.muted}>You can&apos;t change your own type or turn off your own sign-in.</p>}
            {note("signin")}
            <div className={styles.inline} style={{ marginTop: 16 }}>
              {pinInput}
              <button
                type="button"
                className={styles.secondary}
                disabled={pending || pin.length !== 6}
                onClick={() => run("pin", () => setPin(signIn.id, pin), "PIN changed. Tell them the new PIN in person.", () => setPinText(""))}
              >
                Set new PIN
              </button>
            </div>
            <p className={styles.muted}>Setting a new PIN also clears a tablet lockout for this person.</p>
            {note("pin")}
          </>
        )}
        {!signIn && note("signin")}
      </section>
    </>
  );
}
