"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidPinFormat, loginEmailFor, pinResultMessage, type PinCheckResult } from "@/lib/sign-in";

export type SignInState = { error: string | null };

const SERVER_TROUBLE = "Sign-in isn't working right now. Check the tablet's signal and try again.";

// Name + PIN sign-in for shared tablets (spec section 4).
// 1. The database checks the PIN and handles lockout (verify_user_pin).
// 2. On success, the server opens a Supabase session for that person, creating
//    their Supabase login the first time. Nothing about the PIN reaches the browser.
export async function signIn(appUserId: string, pin: string): Promise<SignInState> {
  if (typeof appUserId !== "string" || typeof pin !== "string" || !isValidPinFormat(pin)) {
    return { error: "Enter your 4 to 8 digit PIN." };
  }

  const admin = createAdminClient();

  const { data: result, error: verifyError } = await admin.rpc("verify_user_pin", {
    p_user_id: appUserId,
    p_pin: pin,
  });
  if (verifyError) {
    // A badly formed id is just a failed sign-in; anything else is a server problem.
    if (verifyError.code === "22P02") return { error: pinResultMessage("wrong", 0) };
    console.error("verify_user_pin failed", verifyError.code);
    return { error: SERVER_TROUBLE };
  }

  if (result !== "ok") {
    let lockoutMinutes = 15;
    if (result === "locked") {
      const { data: settings } = await admin.from("settings").select("pin_lockout_minutes").single();
      lockoutMinutes = settings?.pin_lockout_minutes ?? lockoutMinutes;
    }
    return { error: pinResultMessage(result as PinCheckResult, lockoutMinutes) };
  }

  try {
    const tokenHash = await oneTimeSignInToken(admin, appUserId);
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
