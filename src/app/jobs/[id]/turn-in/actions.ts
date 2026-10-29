"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE } from "@/lib/hours-data";
import { createClient } from "@/lib/supabase/server";
import { MAX_SIGNATURE_CHARS, turnInProblem } from "@/lib/turn-in";

export type TurnInResult = { ok: true } | { ok: false; error: string };

const TROUBLE = "Couldn't turn in. Check the tablet's signal and try again. Nothing was changed.";

/**
 * Turns in a work order (spec 6.6) with the customer's signature, or with a reason
 * when they can't sign. The database saves both in one step and locks the job.
 */
export async function turnIn(input: {
  workOrderId: string;
  signedName: string | null;
  signaturePng: string | null;
  noSignatureReason: string | null;
}): Promise<TurnInResult> {
  const { workOrderId, signedName, signaturePng, noSignatureReason } = input;
  if (!UUID_RE.test(workOrderId)) return { ok: false, error: TROUBLE };

  const signed = typeof signaturePng === "string";
  const problem = signed
    ? turnInProblem({ mode: "signed", signedName: signedName ?? "", hasInk: true })
    : turnInProblem({ mode: "no-signature", reason: noSignatureReason ?? "" });
  if (problem) return { ok: false, error: problem };
  if (signed && (!signaturePng.startsWith("data:image/png;base64,") || signaturePng.length > MAX_SIGNATURE_CHARS)) {
    return { ok: false, error: "The signature could not be read. Clear it and sign again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("turn_in_work_order", {
    p_work_order_id: workOrderId,
    p_signed_name: signed ? signedName : null,
    p_signature_png: signed ? signaturePng : null,
    p_no_signature_reason: signed ? null : noSignatureReason,
  });
  if (error) {
    // Messages written for people come straight from the database rules.
    if (error.code === "22023" || error.code === "P0001") return { ok: false, error: error.message };
    if (error.code === "42501") return { ok: false, error: "You can't turn in this job." };
    console.error("Turn-in failed", error.code);
    return { ok: false, error: TROUBLE };
  }

  revalidatePath(`/jobs/${workOrderId}`);
  revalidatePath("/");
  return { ok: true };
}
