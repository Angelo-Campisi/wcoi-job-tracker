"use server";

import { revalidatePath } from "next/cache";
import { changeOrderProblem } from "@/lib/change-order-form";
import { UUID_RE } from "@/lib/hours-data";
import { createClient } from "@/lib/supabase/server";
import type { ChangeOrderType } from "@/lib/types";

const TROUBLE = "Couldn't save. Check the tablet's signal and try again.";

export type CreateChangeOrderResult = { ok: true; type: ChangeOrderType } | { ok: false; error: string };

/**
 * Submits a change order (spec 6.7). The database decides quick vs. large from the
 * owner's threshold: quick ones are approved on the spot, large ones wait for the owner.
 * Leads can submit only on their own open jobs (database rule).
 */
export async function createChangeOrder(
  workOrderId: string,
  hours: number,
  description: string,
): Promise<CreateChangeOrderResult> {
  if (!UUID_RE.test(workOrderId) || typeof description !== "string") return { ok: false, error: TROUBLE };
  const problem = changeOrderProblem(typeof hours === "number" ? hours : null, description);
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("change_orders")
    .insert({ work_order_id: workOrderId, hours_added: hours, description: description.trim() })
    .select("type")
    .single();
  if (error) {
    if (error.code === "P0001") return { ok: false, error: error.message };
    if (error.code === "42501") {
      return { ok: false, error: "This job has been turned in, so change orders go through the office now." };
    }
    console.error("Change order save failed", error.code);
    return { ok: false, error: TROUBLE };
  }
  revalidate(workOrderId);
  return { ok: true, type: data.type as ChangeOrderType };
}

export type DecideResult = { ok: true } | { ok: false; error: string };

/** The owner approves or denies a large change order (spec 6.7). Owner only (database rule). */
export async function decideChangeOrder(changeOrderId: string, decision: "approved" | "denied"): Promise<DecideResult> {
  if (!UUID_RE.test(changeOrderId) || (decision !== "approved" && decision !== "denied")) {
    return { ok: false, error: TROUBLE };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("change_orders")
    .update({ status: decision })
    .eq("id", changeOrderId)
    .eq("status", "pending")
    .select("work_order_id");
  if (error) {
    console.error("Change order decision failed", error.code);
    return { ok: false, error: TROUBLE };
  }
  if (!data?.length) {
    return { ok: false, error: "Only the owner can approve or deny, and only while it's still waiting." };
  }
  revalidate(data[0].work_order_id as string);
  return { ok: true };
}

function revalidate(workOrderId: string) {
  revalidatePath(`/jobs/${workOrderId}`);
  revalidatePath("/");
  revalidatePath("/change-orders");
}
