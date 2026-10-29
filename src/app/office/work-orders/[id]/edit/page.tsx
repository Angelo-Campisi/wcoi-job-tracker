import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { UUID_RE } from "@/lib/hours-data";
import { requireStaffSession } from "@/lib/session";
import WorkOrderForm from "../../WorkOrderForm";
import styles from "../../../office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit work order · WCOI Job Tracker" };

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, lockMinutes } = await requireStaffSession();
  if (!UUID_RE.test(id)) notFound();

  const { data: wo } = await supabase
    .from("work_orders")
    .select(
      `id, status, quote_number, po_number, order_date, job_type_override,
      bill_to_company, bill_to_contact, bill_to_phone,
      ship_to_company, ship_to_address, ship_to_contact, ship_to_phone, notes,
      work_order_lines (line_number, description, quantity, is_labor),
      time_entries (id)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!wo) notFound();

  const lines = [...wo.work_order_lines]
    .sort((a, b) => a.line_number - b.line_number)
    .map((l) => ({ description: l.description as string, quantity: String(Number(l.quantity)), isLabor: l.is_labor as boolean }));

  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref={`/jobs/${id}`} backLabel="Work order" />
      <h1 className={styles.title}>Edit work order</h1>
      <WorkOrderForm
        id={wo.id}
        canDelete={wo.status === "open" && wo.time_entries.length === 0}
        locked={wo.status === "approved" || wo.status === "sent"}
        initial={{
          quoteNumber: wo.quote_number,
          poNumber: wo.po_number,
          orderDate: wo.order_date,
          jobTypeOverride: wo.job_type_override ?? "",
          billToCompany: wo.bill_to_company,
          billToContact: wo.bill_to_contact,
          billToPhone: wo.bill_to_phone,
          shipToCompany: wo.ship_to_company,
          shipToAddress: wo.ship_to_address,
          shipToContact: wo.ship_to_contact,
          shipToPhone: wo.ship_to_phone,
          notes: wo.notes,
          lines,
        }}
      />
    </main>
  );
}
