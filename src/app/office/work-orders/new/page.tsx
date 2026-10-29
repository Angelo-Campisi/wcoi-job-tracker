import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { companyToday } from "@/lib/company-time";
import { requireStaffSession } from "@/lib/session";
import WorkOrderForm from "../WorkOrderForm";
import styles from "../../office.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New work order · WCOI Job Tracker" };

export default async function NewWorkOrderPage() {
  const { me, lockMinutes } = await requireStaffSession();
  return (
    <main className={styles.page}>
      <AppHeader me={me} lockMinutes={lockMinutes} backHref="/office" backLabel="Office" />
      <h1 className={styles.title}>New work order</h1>
      <p className={styles.muted}>After saving, add the lead, the days, and the crew.</p>
      <WorkOrderForm
        id={null}
        canDelete={false}
        locked={false}
        initial={{
          quoteNumber: "",
          poNumber: "",
          orderDate: companyToday(),
          jobTypeOverride: "",
          billToCompany: "",
          billToContact: "",
          billToPhone: "",
          shipToCompany: "",
          shipToAddress: "",
          shipToContact: "",
          shipToPhone: "",
          notes: "",
          lines: [],
        }}
      />
    </main>
  );
}
