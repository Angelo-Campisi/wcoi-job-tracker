"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { MAX_REASON, MAX_SIGNATURE_CHARS, MAX_SIGNED_NAME, turnInProblem } from "@/lib/turn-in";
import { turnIn } from "./actions";
import styles from "./turn-in.module.css";

export default function TurnInForm({ workOrderId, defaultName }: { workOrderId: string; defaultName: string }) {
  const router = useRouter();
  const pad = useRef<SignaturePadHandle>(null);
  const [mode, setMode] = useState<"signed" | "no-signature">("signed");
  const [signedName, setSignedName] = useState(defaultName);
  const [hasInk, setHasInk] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const input = mode === "signed" ? ({ mode, signedName, hasInk } as const) : ({ mode, reason } as const);

  function askToConfirm() {
    const problem = turnInProblem(input);
    setError(problem);
    if (!problem) setConfirming(true);
  }

  function submit() {
    let signaturePng: string | null = null;
    if (mode === "signed") {
      signaturePng = pad.current?.toPng(MAX_SIGNATURE_CHARS) ?? null;
      if (!signaturePng) {
        setConfirming(false);
        setError("The signature could not be read. Clear it and sign again.");
        return;
      }
    }
    startTransition(async () => {
      const result = await turnIn({
        workOrderId,
        signedName: mode === "signed" ? signedName : null,
        signaturePng,
        noSignatureReason: mode === "no-signature" ? reason : null,
      });
      if (result.ok) {
        router.push(`/jobs/${workOrderId}?turnedIn=1`);
      } else {
        setConfirming(false);
        setError(result.error);
      }
    });
  }

  function change() {
    setError(null);
    setConfirming(false);
  }

  return (
    <section className={styles.form} aria-label="Signature">
      {mode === "signed" ? (
        <>
          <h2 className={styles.formTitle}>Customer signature</h2>
          <p className={styles.muted}>By signing, the customer confirms the work was done.</p>
          <SignaturePad
            ref={pad}
            disabled={pending}
            onInkChange={(ink) => {
              setHasInk(ink);
              change();
            }}
          />
          <div className={styles.padActions}>
            <button type="button" className={styles.secondary} onClick={() => pad.current?.clear()} disabled={pending || !hasInk}>
              Clear signature
            </button>
          </div>
          <label htmlFor="signed-name" className={styles.label}>
            Name of the person signing
          </label>
          <input
            id="signed-name"
            className={styles.input}
            autoComplete="off"
            maxLength={MAX_SIGNED_NAME}
            value={signedName}
            onChange={(e) => {
              setSignedName(e.target.value);
              change();
            }}
            disabled={pending}
          />
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setMode("no-signature");
              change();
            }}
            disabled={pending}
          >
            Customer can&apos;t sign?
          </button>
        </>
      ) : (
        <>
          <h2 className={styles.formTitle}>No signature</h2>
          <label htmlFor="no-sign-reason" className={styles.label}>
            Why can&apos;t the customer sign?
          </label>
          <textarea
            id="no-sign-reason"
            className={styles.textarea}
            rows={3}
            maxLength={MAX_REASON}
            placeholder="For example: on-site contact left before we finished"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              change();
            }}
            disabled={pending}
          />
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setMode("signed");
              setHasInk(false);
              change();
            }}
            disabled={pending}
          >
            Get a signature instead
          </button>
        </>
      )}

      <p className={styles.error} role="alert">
        {error}
      </p>

      {confirming ? (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="turn-in-confirm">
          <p id="turn-in-confirm" className={styles.confirmText}>
            Turn in this work order? After this, hours and crew can&apos;t be changed except by the office.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setConfirming(false)} disabled={pending}>
              Not yet
            </button>
            <button type="button" className={styles.primary} onClick={submit} disabled={pending}>
              {pending ? "Turning in…" : "Yes, turn it in"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={askToConfirm} disabled={pending}>
            Turn in work order
          </button>
        </div>
      )}
    </section>
  );
}
