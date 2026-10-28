"use client";

import { useState, useTransition } from "react";
import { addPinDigit, isValidPinFormat, PIN_LENGTH, removePinDigit } from "@/lib/sign-in";
import { signIn } from "./actions";
import styles from "./sign-in.module.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// PIN-only sign-in: each person's PIN is unique, so it says who they are.
// Signs in as soon as the 6th digit is entered.
export default function SignInForm({ lockedForInactivity }: { lockedForInactivity: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(next: string) {
    if (pending) return;
    setError(null);
    setPin(next);
    if (isValidPinFormat(next)) submit(next);
  }

  function submit(fullPin: string) {
    startTransition(async () => {
      const result = await signIn(fullPin);
      // On success the server sends the tablet to the jobs screen, so we only get here on a problem.
      setPin("");
      setError(result?.error ?? null);
    });
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>WCOI Job Tracker</h1>
      {lockedForInactivity && (
        <p className={styles.notice} role="status">
          The screen locked because nobody used it for a while. Sign in again to keep going.
        </p>
      )}
      <p className={styles.subtitle}>{pending ? "Signing in…" : "Enter your PIN"}</p>

      <div className={styles.pinForm}>
        {/* Hidden field lets a keyboard type the PIN too; the dots show how many digits. */}
        <input
          className={styles.hiddenInput}
          aria-label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(event) => update(event.target.value.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH))}
          disabled={pending}
        />
        <div className={styles.dots} aria-hidden="true">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={i < pin.length ? styles.dotFilled : styles.dot} />
          ))}
        </div>

        <p className={styles.error} role="alert">
          {error}
        </p>

        <div className={styles.keypad}>
          {KEYS.map((key) => (
            <button key={key} type="button" className={styles.key} onClick={() => update(addPinDigit(pin, key))} disabled={pending}>
              {key}
            </button>
          ))}
          <button
            type="button"
            className={styles.keySmall}
            onClick={() => update("")}
            disabled={pending || pin.length === 0}
          >
            Clear
          </button>
          <button type="button" className={styles.key} onClick={() => update(addPinDigit(pin, "0"))} disabled={pending}>
            0
          </button>
          <button
            type="button"
            className={styles.keySmall}
            onClick={() => update(removePinDigit(pin))}
            disabled={pending || pin.length === 0}
            aria-label="Delete last digit"
          >
            ⌫
          </button>
        </div>
      </div>
    </main>
  );
}
