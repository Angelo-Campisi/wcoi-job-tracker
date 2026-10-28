import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import SignInForm, { type SignInPerson } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · WCOI Job Tracker" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims) redirect("/");

  const { locked } = await searchParams;
  const people = await loadPeople();

  return <SignInForm people={people} lockedForInactivity={locked === "1"} />;
}

// Names to pick from: every active lead, bookkeeper and owner. Names only; no ids
// of employees, roles, or anything else leave the server.
async function loadPeople(): Promise<SignInPerson[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_users")
    .select("id, employees!inner(name, active)")
    .eq("active", true)
    .eq("employees.active", true);
  if (error) {
    console.error("Loading sign-in names failed", error.code);
    return [];
  }
  return data
    .map((row) => {
      const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
      return { id: row.id as string, name: (employee?.name as string) ?? "" };
    })
    .filter((person) => person.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
