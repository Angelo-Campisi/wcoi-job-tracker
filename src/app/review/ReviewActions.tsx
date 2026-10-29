"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WorkOrderStatus } from "@/lib/types";
import { reviewStep } from "./actions";
import styles from "./review.module.css";

// Approve, undo approval, or send back to the lead. The database has the final say.
export default function ReviewActions({
  workOrderId,
  status,
  blockers,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  blockers: string[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"approve" | "reopen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(step: "approve" | "unapprove" | "reopen") {
    startTransition(async () => {
      const result = await reviewStep(workOrderId, step);
      setConfirm(null);
      if (result.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (status === "sent") return <p className={styles.muted}>Sent to QuickBooks. Nothing more to do here.</p>;

  if (status === "approved") {
    return (
      <div className={styles.actions}>
        <p className={styles.muted}>Hours and change orders are locked. Undo the approval to change anything.</p>
        <button type="button" className={styles.secondary} onClick={() => run("unapprove")} disabled={pending}>
          {pending ? "Working…" : "Undo approval"}
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      {blockers.length > 0 && (
        <ul className={styles.blockers}>
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      {confirm === "approve" ? (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="approve-q">
          <p id="approve-q" className={styles.confirmText}>
            Approve these hours? They&apos;ll be locked and ready for QuickBooks.
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} onClick={() => setConfirm(null)} disabled={pending}>
              Not yet
            </button>
            <button type="button" className={styles.primary} onClick={() => run("approve")} disabled={pending}>
              {pending ? "Approving…" : "Yes, approve"}
            </button>
          </div>
        </div>
      ) : confirm === "reopen" ? (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="reopen-q">
          <p id="reopen-q" className={styles.confirmText}>
            Send this job back to the lead? It goes back to open, the customer&apos;s signature is removed, and the lead
            turns it in again.
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} onClick={() => setConfirm(null)} disabled={pending}>
              Cancel
            </button>
            <button type="button" className={styles.danger} onClick={() => run("reopen")} disabled={pending}>
              {pending ? "Reopening…" : "Yes, reopen"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.buttons}>
          <Link href={`/jobs/${workOrderId}/hours`} className={styles.secondary}>
            Fix hours
          </Link>
          <button type="button" className={styles.secondary} onClick={() => setConfirm("reopen")} disabled={pending}>
            Send back to lead
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => setConfirm("approve")}
            disabled={pending || blockers.length > 0}
          >
            Approve hours
          </button>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
