// The company's clock: Omaha, so US Central time unless COMPANY_TIME_ZONE says otherwise.
import { todayIn } from "./my-jobs";

export const COMPANY_TIME_ZONE = process.env.COMPANY_TIME_ZONE || "America/Chicago";

/** Today's date ("YYYY-MM-DD") for the company. */
export function companyToday(now: Date = new Date()): string {
  return todayIn(COMPANY_TIME_ZONE, now);
}
