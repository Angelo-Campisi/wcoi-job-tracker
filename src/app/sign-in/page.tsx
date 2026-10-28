import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignInForm from "./SignInForm";

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
  return <SignInForm lockedForInactivity={locked === "1"} />;
}
