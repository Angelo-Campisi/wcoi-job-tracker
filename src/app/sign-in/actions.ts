"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidPinFormat, loginEmailFor, pinResultMessage, type PinCheckResult } from "@/lib/sign-in";

export type SignInState = { error: string | null };

const SERVER_TROUBLE = "Sign-in isn't working right now. Check the tablet's signal and try again.";
const DEVICE_COOKIE = "wcoi_device";

// PIN-only sign-in for shared tablets (spec section 4; owner's choice 2026-10-28).
// 1. The database finds who the PIN belongs to, and counts wrong tries per tablet,
//    per internet address, and system-wide (sign_in_with_pin).
// 2. On success, the server opens a Supabase session for that person, creating
//    their Supabase login the first time. Nothing about the PIN reaches the browser.
export async function signIn(pin: string): Promise<SignInState> {
  if (typeof pin !== "string" || !isValidPinFormat(pin)) {
    return { error: "Enter your 6 digit PIN." };
  }

  const admin = createAdminClient();
  const { data, error: checkError } = await admin.rpc("sign_in_with_pin", {
    p_pin: pin,
    p_device_key: await deviceKey(),
    p_ip: await clientIp(),
  });
  if (checkError) {
    console.error("sign_in_with_pin failed", checkError.code);
    return { error: SERVER_TROUBLE };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { result: PinCheckResult; user_id: string | null } | null;
  if (!row) return { error: SERVER_TROUBLE };

  if (row.result !== "ok" || !row.user_id) {
    let lockoutMinutes = 15;
    if (row.result === "locked") {
      const { data: settings } = await admin.from("settings").select("pin_lockout_minutes").single();
      lockoutMinutes = settings?.pin_lockout_minutes ?? lockoutMinutes;
    }
    return { error: pinResultMessage(row.result, lockoutMinutes) };
  }

  try {
    const tokenHash = await oneTimeSignInToken(admin, row.user_id);
    // Trading the one-time token for a session sets the session cookies on this tablet.
    const supabase = await createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (otpError) throw otpError;
  } catch (error) {
    console.error("Opening a session failed", error instanceof Error ? error.message : "unknown");
    return { error: SERVER_TROUBLE };
  }

  redirect("/");
}

// A random id kept on the tablet, so wrong tries on one tablet don't lock the others.
async function deviceKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = randomUUID();
  store.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  return id;
}

// The tablet's internet address, as reported by the host (Vercel sets these headers).
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Returns a one-time token that opens a session for this person.
// On their first sign-in it also creates their Supabase login and links it.
async function oneTimeSignInToken(admin: AdminClient, appUserId: string, retry = true): Promise<string> {
  const { data: appUser, error } = await admin
    .from("app_users")
    .select("id, auth_user_id")
    .eq("id", appUserId)
    .single();
  if (error || !appUser) throw error ?? new Error("App user not found");

  let email = loginEmailFor(appUserId);
  if (appUser.auth_user_id) {
    const { data, error: getError } = await admin.auth.admin.getUserById(appUser.auth_user_id);
    if (getError || !data.user?.email) throw getError ?? new Error("Login has no email");
    email = data.user.email;
  } else {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { app_user_id: appUserId },
    });
    // "email_exists" means an earlier first sign-in got this far; reuse that login.
    if (createError && createError.code !== "email_exists") throw createError;
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.hashed_token || !link.user) {
    throw linkError ?? new Error("No sign-in token");
  }

  if (appUser.auth_user_id !== link.user.id) {
    if (appUser.auth_user_id) throw new Error("Login does not match app user");
    // Link only if nobody linked it first (two tablets signing in at once).
    const { data: linked, error: updateError } = await admin
      .from("app_users")
      .update({ auth_user_id: link.user.id })
      .eq("id", appUserId)
      .is("auth_user_id", null)
      .select("id");
    if (updateError) throw updateError;
    if (!linked?.length) {
      if (!retry) throw new Error("Could not link login");
      return oneTimeSignInToken(admin, appUserId, false);
    }
  }
  return link.properties.hashed_token;
}

export async function signOut(reason?: "locked"): Promise<void> {
  const supabase = await createClient();
  // "local" ends the session on this tablet only.
  await supabase.auth.signOut({ scope: "local" });
  redirect(reason === "locked" ? "/sign-in?locked=1" : "/sign-in");
}
