"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE } from "@/lib/hours-data";
import { checkName, checkWage } from "@/lib/office-forms";
import { isValidPinFormat } from "@/lib/sign-in";
import { createClient } from "@/lib/supabase/server";

const TROUBLE = "Couldn't save. Check the connection and try again.";
const ROLES = ["lead", "bookkeeper", "owner"] as const;
type Role = (typeof ROLES)[number];

export type PeopleResult = { ok: true; id?: string; warning?: string } | { ok: false; error: string };

/** Adds an employee, with an optional starting wage and an optional sign-in + PIN. */
export async function createPerson(input: {
  name: string;
  wage: string;
  wageFrom: string;
  role: "" | Role;
  pin: string;
}): Promise<PeopleResult> {
  const nameProblem = checkName(input.name);
  if (nameProblem) return { ok: false, error: nameProblem };
  const wantsWage = input.wage.trim() !== "";
  const wage = wantsWage ? checkWage(input.wage, input.wageFrom) : null;
  if (wage && !wage.ok) return { ok: false, error: Object.values(wage.errors)[0] };
  if (input.role !== "" && !ROLES.includes(input.role)) return { ok: false, error: "Pick a sign-in type." };
  if (input.role !== "" && !isValidPinFormat(input.pin)) return { ok: false, error: "A sign-in needs a 6-digit PIN." };

  const supabase = await createClient();
  const { data: employee, error } = await supabase.from("employees").insert({ name: input.name.trim() }).select("id").single();
  if (error) return { ok: false, error: message(error) };
  const id = employee.id as string;

  // The employee exists from here on; anything that fails below is reported, and
  // can be finished on the person's page.
  if (wage?.ok) {
    const { error: wageError } = await supabase.from("employee_wages").insert({ employee_id: id, ...wage.value });
    if (wageError) return done({ ok: true, id, warning: `Saved, but the wage wasn't: ${message(wageError)}` });
  }
  if (input.role !== "") {
    const signIn = await createSignIn(supabase, id, input.role, input.pin);
    if (!signIn.ok) return done({ ok: true, id, warning: `Saved, but the sign-in wasn't: ${signIn.error}` });
  }
  return done({ ok: true, id });
}

export async function updateEmployee(id: string, name: string, active: boolean): Promise<PeopleResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: TROUBLE };
  const problem = checkName(name);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").update({ name: name.trim(), active: Boolean(active) }).eq("id", id).select("id");
  if (error) return { ok: false, error: message(error) };
  if (!data?.length) return { ok: false, error: "Only the bookkeeper or owner can change people." };
  return done({ ok: true });
}

export async function addWage(employeeId: string, wageText: string, from: string): Promise<PeopleResult> {
  if (!UUID_RE.test(employeeId)) return { ok: false, error: TROUBLE };
  const wage = checkWage(wageText, from);
  if (!wage.ok) return { ok: false, error: Object.values(wage.errors)[0] };
  const supabase = await createClient();
  const { error } = await supabase.from("employee_wages").insert({ employee_id: employeeId, ...wage.value });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "There's already a wage starting that day. Remove it first." : message(error) };
  }
  return done({ ok: true });
}

export async function deleteWage(wageId: string): Promise<PeopleResult> {
  if (!UUID_RE.test(wageId)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { data, error } = await supabase.from("employee_wages").delete().eq("id", wageId).select("id");
  if (error) return { ok: false, error: message(error) };
  if (!data?.length) return { ok: false, error: "Only the bookkeeper or owner can change wages." };
  return done({ ok: true });
}

export async function giveSignIn(employeeId: string, role: Role, pin: string): Promise<PeopleResult> {
  if (!UUID_RE.test(employeeId) || !ROLES.includes(role)) return { ok: false, error: TROUBLE };
  if (!isValidPinFormat(pin)) return { ok: false, error: "Enter a 6-digit PIN." };
  const supabase = await createClient();
  return done(await createSignIn(supabase, employeeId, role, pin));
}

export async function updateSignIn(appUserId: string, role: Role, active: boolean): Promise<PeopleResult> {
  if (!UUID_RE.test(appUserId) || !ROLES.includes(role)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_users").update({ role, active: Boolean(active) }).eq("id", appUserId).select("id");
  if (error) return { ok: false, error: message(error) };
  if (!data?.length) return { ok: false, error: "Only the owner can change an owner's sign-in." };
  return done({ ok: true });
}

export async function setPin(appUserId: string, pin: string): Promise<PeopleResult> {
  if (!UUID_RE.test(appUserId)) return { ok: false, error: TROUBLE };
  if (!isValidPinFormat(pin)) return { ok: false, error: "Enter a 6-digit PIN." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_pin", { p_user_id: appUserId, p_pin: pin });
  if (error) return { ok: false, error: message(error) };
  return done({ ok: true });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function createSignIn(supabase: Supabase, employeeId: string, role: Role, pin: string): Promise<PeopleResult> {
  const { data: user, error } = await supabase.from("app_users").insert({ employee_id: employeeId, role }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This person already has a sign-in." };
    if (error.code === "42501") return { ok: false, error: "Only the owner can create an owner sign-in." };
    return { ok: false, error: message(error) };
  }
  const { error: pinError } = await supabase.rpc("set_user_pin", { p_user_id: user.id, p_pin: pin });
  if (pinError) {
    // No sign-in without a PIN: take it back out so they can try another PIN.
    await supabase.from("app_users").delete().eq("id", user.id);
    return { ok: false, error: message(pinError) };
  }
  return { ok: true, id: user.id as string };
}

function done(result: PeopleResult): PeopleResult {
  revalidatePath("/office/people");
  revalidatePath("/office/people/[id]", "page");
  return result;
}

// Database messages written for people (PIN taken, owner rules) pass through.
function message(error: { code?: string; message: string }): string {
  if (["P0001", "23505", "22023", "23514", "42501"].includes(error.code ?? "")) {
    if (error.code === "42501" && /row-level security/.test(error.message)) return "Only the owner can change an owner.";
    return error.message;
  }
  console.error("People save failed", error.code);
  return TROUBLE;
}
