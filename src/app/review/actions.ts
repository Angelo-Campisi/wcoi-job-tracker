"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE } from "@/lib/hours-data";
import { createClient } from "@/lib/supabase/server";

export type ReviewResult = { ok: true } | { ok: false; error: string };

const FUNCTIONS = {
  approve: "approve_work_order",
  unapprove: "unapprove_work_order",
  reopen: "reopen_work_order",
} as const;

/**
 * Bookkeeper review steps (spec 6.5, 6.6). The database checks who may do each
 * step and when, and logs every one.
 * - approve: turned in -> approved (locks hours and change orders)
 * - unapprove: approved -> turned in
 * - reopen: turned in -> open (back to the lead; removes the signature)
 */
export async function reviewStep(workOrderId: string, step: keyof typeof FUNCTIONS): Promise<ReviewResult> {
  if (!UUID_RE.test(workOrderId) || !(step in FUNCTIONS)) return { ok: false, error: "Something went wrong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(FUNCTIONS[step], { p_work_order_id: workOrderId });
  if (error) {
    if (error.code === "P0001") return { ok: false, error: error.message };
    if (error.code === "42501") return { ok: false, error: "Only the bookkeeper or owner can do this." };
    console.error("Review step failed", step, error.code);
    return { ok: false, error: "Couldn't save. Check the connection and try again." };
  }
  revalidatePath(`/jobs/${workOrderId}`);
  revalidatePath(`/review/${workOrderId}`);
  revalidatePath("/review");
  revalidatePath("/");
  return { ok: true };
}
