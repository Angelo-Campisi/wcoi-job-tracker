"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideChangeOrder } from "./actions";
import styles from "./change-orders.module.css";

// Owner only: approve or deny a large change order waiting for a decision.
export default function DecideButtons({ changeOrderId, hoursLabel }: { changeOrderId: string; hoursLabel: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "denied") {
    if (decision === "denied" && !window.confirm(`Deny this change order (${hoursLabel})? The budget won't change.`)) return;
    startTransition(async () => {
      const result = await decideChangeOrder(changeOrderId, decision);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className={styles.decide}>
      <button type="button" className={styles.approve} onClick={() => decide("approved")} disabled={pending}>
        Approve
      </button>
      <button type="button" className={styles.deny} onClick={() => decide("denied")} disabled={pending}>
        Deny
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
