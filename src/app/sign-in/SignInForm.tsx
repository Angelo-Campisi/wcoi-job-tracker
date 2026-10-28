"use client";

import { useState, useTransition } from "react";
import { addPinDigit, isValidPinFormat, PIN_MAX_LENGTH, PIN_MIN_LENGTH, removePinDigit } from "@/lib/sign-in";
import { signIn } from "./actions";
import styles from "./sign-in.module.css";

export type SignInPerson = { id: string; name: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function SignInForm({
  people,
  lockedForInactivity,
}: {
  people: SignInPerson[];
  lockedForInactivity: boolean;
}) {
  const [person, setPerson] = useState<SignInPerson | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: SignInPerson | null) {
    setPerson(next);
    setPin("");
    setError(null);
  }

  function press(digit: string) {
    setError(null);
    setPin((current) => addPinDigit(current, digit));
  }

  function submit() {
    if (!person || !isValidPinFormat(pin) || pending) return;
    startTransition(async () => {
      const result = await signIn(person.id, pin);
      // On success the server sends the tablet to the jobs screen, so we only get here on a problem.
      setPin("");
      setError(result?.error ?? null);
    });
  }

  if (!person) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Who is signing in?</h1>
        {lockedForInactivity && (
          <p className={styles.notice} role="status">
            The screen locked because nobody used it for a while. Sign in again to keep going.
          </p>
        )}
        {people.length === 0 ? (
          <p className={styles.error} role="alert">
            No names to show. Check the tablet&apos;s signal, or ask the office to set up sign-ins.
          </p>
        ) : (
          <ul className={styles.names}>
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" className={styles.nameButton} onClick={() => choose(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={() => choose(null)} disabled={pending}>
        ← Not {person.name}?
      </button>
      <h1 className={styles.title}>{person.name}</h1>
      <p className={styles.subtitle}>Enter your PIN</p>

      <form
        className={styles.pinForm}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {/* Hidden field lets a keyboard type the PIN too; the dots show how many digits. */}
        <input
          className={styles.hiddenInput}
          aria-label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={PIN_MAX_LENGTH}
          value={pin}
          onChange={(event) => {
            setError(null);
            setPin(event.target.value.replace(/[^0-9]/g, "").slice(0, PIN_MAX_LENGTH));
          }}
          disabled={pending}
        />
        <div className={styles.dots} aria-hidden="true">
          {Array.from({ length: Math.max(PIN_MIN_LENGTH, pin.length) }, (_, i) => (
            <span key={i} className={i < pin.length ? styles.dotFilled : styles.dot} />
          ))}
        </div>

        <p className={styles.error} role="alert">
          {error}
        </p>

        <div className={styles.keypad}>
          {KEYS.map((key) => (
            <button key={key} type="button" className={styles.key} onClick={() => press(key)} disabled={pending}>
              {key}
            </button>
          ))}
          <button
            type="button"
            className={styles.keySmall}
            onClick={() => {
              setError(null);
              setPin(removePinDigit);
            }}
            disabled={pending || pin.length === 0}
            aria-label="Delete last digit"
          >
            ⌫
          </button>
          <button type="button" className={styles.key} onClick={() => press("0")} disabled={pending}>
            0
          </button>
          <button type="submit" className={styles.keyGo} disabled={pending || !isValidPinFormat(pin)}>
            {pending ? "…" : "Go"}
          </button>
        </div>
      </form>
    </main>
  );
}
