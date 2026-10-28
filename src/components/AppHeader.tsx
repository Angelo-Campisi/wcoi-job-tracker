import Link from "next/link";
import { signOut } from "@/app/sign-in/actions";
import type { Me } from "@/lib/jobs-data";
import InactivityLock from "./InactivityLock";
import styles from "./app-header.module.css";

const ROLE_LABELS = { lead: "Job lead", bookkeeper: "Bookkeeper", owner: "Owner" } as const;

// Top of every signed-in screen: who is signed in, sign out, and the auto-lock.
export default function AppHeader({
  me,
  lockMinutes,
  backHref,
  backLabel,
}: {
  me: Me;
  lockMinutes: number;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className={styles.header}>
      <InactivityLock lockMinutes={lockMinutes} />
      {backHref ? (
        <Link href={backHref} className={styles.back}>
          ← {backLabel ?? "Back"}
        </Link>
      ) : (
        <div>
          <p className={styles.who}>{me.name}</p>
          <p className={styles.role}>{ROLE_LABELS[me.role]}</p>
        </div>
      )}
      <div className={styles.right}>
        {backHref && <span className={styles.whoSmall}>{me.name}</span>}
        <SignOutButton />
      </div>
    </header>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut();
      }}
    >
      <button type="submit" className={styles.signOut}>
        Sign out
      </button>
    </form>
  );
}
