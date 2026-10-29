import "server-only";
import { redirect } from "next/navigation";
import { loadMe, type Me } from "./jobs-data";
import { createClient } from "./supabase/server";

export type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  /** Null when the login has no active app user (turned off by the office). */
  me: Me | null;
  lockMinutes: number;
};

/** For signed-in screens: who is signed in, or off to the sign-in screen. */
export async function requireSession(): Promise<Session> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const authUserId = claims?.claims.sub;
  if (!authUserId) redirect("/sign-in");

  const [me, { data: settings }] = await Promise.all([
    loadMe(supabase, authUserId),
    supabase.from("settings").select("inactivity_lock_minutes").maybeSingle(),
  ]);
  return { supabase, me, lockMinutes: settings?.inactivity_lock_minutes ?? 5 };
}

export type StaffSession = Session & { me: NonNullable<Session["me"]> };

/** For office screens: bookkeeper and owner only. Everyone else goes back home. */
export async function requireStaffSession(): Promise<StaffSession> {
  const session = await requireSession();
  if (!session.me || session.me.role === "lead") redirect("/");
  return session as StaffSession;
}
