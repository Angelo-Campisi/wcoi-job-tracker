import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { requireStaffSession } from "@/lib/session";
import SettingsForm from "./SettingsForm";
import styles from "../office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings · WCOI Job Tracker" };

export default async function SettingsPage() {
  const { supabase, me, lockMinutes } = await requireStaffSession();
  const { data: s, error } = await supabase
    .from("settings")
    .select(
      "daily_hours_threshold, large_change_order_threshold_hours, inactivity_lock_minutes, pin_max_attempts, pin_lockout_minutes, pin_failures_per_hour_limit",
    )
    .single();
  if (error) throw new Error(`Loading settings failed (${error.code})`);
  const str = (v: unknown) => String(Number(v));

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/office" backLabel="Office" />
      <h1 className={styles.title}>Settings</h1>
      <SettingsForm
        initial={{
          dailyHoursThreshold: str(s.daily_hours_threshold),
          largeChangeOrderThresholdHours: str(s.large_change_order_threshold_hours),
          inactivityLockMinutes: str(s.inactivity_lock_minutes),
          pinMaxAttempts: str(s.pin_max_attempts),
          pinLockoutMinutes: str(s.pin_lockout_minutes),
          pinFailuresPerHourLimit: str(s.pin_failures_per_hour_limit),
        }}
      />
    </main>
  );
}
