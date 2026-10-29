"use server";

import { revalidatePath } from "next/cache";
import { DATE_RE, UUID_RE } from "@/lib/hours-data";
import { checkWorkOrder, type WorkOrderFormInput } from "@/lib/office-forms";
import { createClient } from "@/lib/supabase/server";

const TROUBLE = "Couldn't save. Check the connection and try again.";

export type SaveWorkOrderResult =
  | { ok: true; id: string }
  | { ok: false; errors: Record<string, string>; error?: string };

/** Creates or updates a work order and its line items (office only, database rule). */
export async function saveWorkOrder(id: string | null, input: WorkOrderFormInput): Promise<SaveWorkOrderResult> {
  if (id !== null && !UUID_RE.test(id)) return { ok: false, errors: {}, error: TROUBLE };
  const checked = checkWorkOrder(input);
  if (!checked.ok) return { ok: false, errors: checked.errors, error: "Fix the marked fields." };
  const { lines, ...header } = checked.value;

  const supabase = await createClient();
  let workOrderId = id;
  if (workOrderId === null) {
    const { data, error } = await supabase.from("work_orders").insert(header).select("id").single();
    if (error) return failed(error);
    workOrderId = data.id as string;
  } else {
    const { data, error } = await supabase.from("work_orders").update(header).eq("id", workOrderId).select("id");
    if (error) return failed(error);
    if (!data?.length) return { ok: false, errors: {}, error: "Only the bookkeeper or owner can edit work orders." };
  }

  // Only rewrite line items when they changed (keeps the change history clean,
  // and lets the office fix details like a phone number on an approved job).
  let linesChanged = true;
  if (id !== null) {
    const { data: existing } = await supabase
      .from("work_order_lines")
      .select("line_number, description, quantity, is_labor")
      .eq("work_order_id", workOrderId)
      .order("line_number");
    const same = (existing ?? []).map((l) => ({ ...l, quantity: Number(l.quantity) }));
    linesChanged = JSON.stringify(same) !== JSON.stringify(lines);
  }

  const { error: linesError } = linesChanged
    ? await supabase.rpc("replace_work_order_lines", { p_work_order_id: workOrderId, p_lines: lines })
    : { error: null };
  if (linesError) {
    // A brand-new work order without its lines would be confusing; take it back out.
    if (id === null) await supabase.from("work_orders").delete().eq("id", workOrderId);
    return failed(linesError);
  }

  revalidatePath("/");
  revalidatePath(`/jobs/${workOrderId}`);
  return { ok: true, id: workOrderId };
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function deleteWorkOrder(id: string): Promise<SimpleResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { data, error } = await supabase.from("work_orders").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: failed(error).error ?? TROUBLE };
  if (!data?.length) return { ok: false, error: "Only the bookkeeper or owner can delete work orders." };
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------- leads and days

export async function addLead(workOrderId: string, leadUserId: string): Promise<SimpleResult> {
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(leadUserId)) return { ok: false, error: "Pick a lead." };
  const supabase = await createClient();
  const { error } = await supabase.from("job_assignments").insert({ work_order_id: workOrderId, lead_user_id: leadUserId });
  if (error) return { ok: false, error: error.code === "23505" ? "That lead is already on this job." : simple(error) };
  return done(workOrderId);
}

export async function removeLead(workOrderId: string, assignmentId: string): Promise<SimpleResult> {
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(assignmentId)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { error } = await supabase.from("job_assignments").delete().eq("id", assignmentId).eq("work_order_id", workOrderId);
  if (error) return { ok: false, error: simple(error) };
  return done(workOrderId);
}

export async function addLeadDate(workOrderId: string, assignmentId: string, date: string): Promise<SimpleResult> {
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(assignmentId)) return { ok: false, error: TROUBLE };
  if (!DATE_RE.test(date)) return { ok: false, error: "Pick a day." };
  const supabase = await createClient();
  const { error } = await supabase.from("job_assignment_dates").insert({ assignment_id: assignmentId, work_date: date });
  if (error && error.code !== "23505") return { ok: false, error: simple(error) };
  return done(workOrderId);
}

export async function removeLeadDate(workOrderId: string, assignmentId: string, date: string): Promise<SimpleResult> {
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(assignmentId) || !DATE_RE.test(date)) return { ok: false, error: TROUBLE };
  const supabase = await createClient();
  const { error } = await supabase.from("job_assignment_dates").delete().eq("assignment_id", assignmentId).eq("work_date", date);
  if (error) return { ok: false, error: simple(error) };
  return done(workOrderId);
}

function done(workOrderId: string): SimpleResult {
  revalidatePath(`/office/work-orders/${workOrderId}/schedule`);
  revalidatePath(`/jobs/${workOrderId}`);
  revalidatePath("/");
  return { ok: true };
}

// Messages written for people pass through; anything else stays generic.
function simple(error: { code?: string; message: string }): string {
  if (error.code === "P0001" || error.code === "23514" || error.code === "23503") return error.message;
  if (error.code === "42501") return "Only the bookkeeper or owner can do this.";
  console.error("Office save failed", error.code);
  return TROUBLE;
}

function failed(error: { code?: string; message: string }): { ok: false; errors: Record<string, string>; error: string } {
  return { ok: false, errors: {}, error: simple(error) };
}
