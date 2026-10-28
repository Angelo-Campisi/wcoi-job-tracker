import { redirect } from "next/navigation";
import InactivityLock from "@/components/InactivityLock";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./sign-in/actions";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const ROLE_LABELS = { lead: "Job lead", bookkeeper: "Bookkeeper", owner: "Owner" } as const;

// Placeholder home after sign-in. The "My jobs" list replaces the body next.
export default async function Home() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const authUserId = claims?.claims.sub;
  if (!authUserId) redirect("/sign-in");

  // Read as the signed-in person, so row-level security applies.
  const [{ data: me }, { data: settings }] = await Promise.all([
    supabase
      .from("app_users")
      .select("role, employees(name)")
      .eq("auth_user_id", authUserId)
      .eq("active", true)
      .maybeSingle(),
    supabase.from("settings").select("inactivity_lock_minutes").maybeSingle(),
  ]);

  // A login with no active app user (e.g. turned off by the office).
  if (!me) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>This sign-in is turned off</h1>
        <p className={styles.placeholder}>Ask the office. Sign out so someone else can use the tablet.</p>
        <SignOutButton />
      </main>
    );
  }

  const employee = Array.isArray(me.employees) ? me.employees[0] : me.employees;
  const name = (employee?.name as string | undefined) ?? "";
  const role = ROLE_LABELS[me.role as keyof typeof ROLE_LABELS] ?? me.role;

  return (
    <main className={styles.page}>
      <InactivityLock lockMinutes={settings?.inactivity_lock_minutes ?? 5} />
      <header className={styles.header}>
        <div>
          <p className={styles.who}>{name}</p>
          <p className={styles.role}>{role}</p>
        </div>
        <SignOutButton />
      </header>
      <h1 className={styles.title}>My jobs</h1>
      <p className={styles.placeholder}>Your jobs will show here.</p>
    </main>
  );
}

function SignOutButton() {
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
