// Office form checks (work orders, people, wages, settings). No database here,
// so they can be tested; the database repeats the important rules.
import type { JobType } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 200;
const MAX_NOTES = 2000;

export type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Reads a number typed into a box: "12", "12.5", "12,5", "$23.50". Null if unreadable. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// ---------------------------------------------------------------- work orders

export interface WorkOrderFormInput {
  quoteNumber: string;
  poNumber: string;
  orderDate: string;
  /** "" means work it out from the lines (decision 1). */
  jobTypeOverride: "" | JobType;
  billToCompany: string;
  billToContact: string;
  billToPhone: string;
  shipToCompany: string;
  shipToAddress: string;
  shipToContact: string;
  shipToPhone: string;
  notes: string;
  lines: { description: string; quantity: string; isLabor: boolean }[];
}

export interface WorkOrderValues {
  quote_number: string;
  po_number: string;
  order_date: string;
  job_type_override: JobType | null;
  bill_to_company: string;
  bill_to_contact: string;
  bill_to_phone: string;
  ship_to_company: string;
  ship_to_address: string;
  ship_to_contact: string;
  ship_to_phone: string;
  notes: string;
  lines: { line_number: number; description: string; quantity: number; is_labor: boolean }[];
}

export function checkWorkOrder(input: WorkOrderFormInput): Result<WorkOrderValues> {
  const errors: Record<string, string> = {};
  const t = (s: string) => (s ?? "").trim();

  if (!isRealDate(input.orderDate)) errors.orderDate = "Pick the order date.";
  if (!t(input.shipToCompany) && !t(input.billToCompany)) errors.shipToCompany = "Enter the customer (Ship To or Bill To).";
  if (!t(input.shipToAddress)) errors.shipToAddress = "Enter the job site address. Leads need it to find the job.";
  if (!["", "quoted", "hourly"].includes(input.jobTypeOverride)) errors.jobTypeOverride = "Pick a job type.";
  for (const key of [
    "quoteNumber", "poNumber", "billToCompany", "billToContact", "billToPhone",
    "shipToCompany", "shipToAddress", "shipToContact", "shipToPhone",
  ] as const) {
    if (t(input[key]).length > MAX_TEXT) errors[key] = `Keep this under ${MAX_TEXT} characters.`;
  }
  if (t(input.notes).length > MAX_NOTES) errors.notes = `Keep notes under ${MAX_NOTES} characters.`;

  const lines: WorkOrderValues["lines"] = [];
  const kept = (input.lines ?? []).filter((l) => t(l.description) || t(l.quantity));
  kept.forEach((l, i) => {
    const quantity = t(l.quantity) === "" ? 0 : parseNumber(l.quantity);
    if (!t(l.description)) errors[`line${i}`] = `Line ${i + 1}: describe the work.`;
    else if (t(l.description).length > MAX_TEXT) errors[`line${i}`] = `Line ${i + 1}: keep it under ${MAX_TEXT} characters.`;
    else if (quantity === null || quantity > 100000) errors[`line${i}`] = `Line ${i + 1}: the quantity should be a number.`;
    else lines.push({ line_number: i + 1, description: t(l.description), quantity, is_labor: Boolean(l.isLabor) });
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      quote_number: t(input.quoteNumber),
      po_number: t(input.poNumber),
      order_date: input.orderDate,
      job_type_override: input.jobTypeOverride === "" ? null : input.jobTypeOverride,
      bill_to_company: t(input.billToCompany),
      bill_to_contact: t(input.billToContact),
      bill_to_phone: t(input.billToPhone),
      ship_to_company: t(input.shipToCompany),
      ship_to_address: t(input.shipToAddress),
      ship_to_contact: t(input.shipToContact),
      ship_to_phone: t(input.shipToPhone),
      notes: t(input.notes),
      lines,
    },
  };
}

// ---------------------------------------------------------------- people

export function checkName(name: string): string | null {
  const n = (name ?? "").trim();
  if (!n) return "Enter the person's name.";
  if (n.length > 100) return "Keep the name under 100 characters.";
  return null;
}

export function checkWage(wageText: string, effectiveFrom: string): Result<{ hourly_wage: number; effective_from: string }> {
  const errors: Record<string, string> = {};
  const wage = parseNumber(wageText);
  if (wage === null || wage <= 0) errors.wage = "Enter the hourly wage, like 22 or 22.50.";
  else if (wage > 500) errors.wage = "That wage looks too high. Check the number.";
  else if (Math.round(wage * 100) !== wage * 100) errors.wage = "Use dollars and cents, like 22.50.";
  if (!isRealDate(effectiveFrom)) errors.effectiveFrom = "Pick the date the wage starts.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { hourly_wage: wage!, effective_from: effectiveFrom } };
}

// ---------------------------------------------------------------- settings

// The company time zone isn't on this screen: the app (COMPANY_TIME_ZONE) and the
// database (settings.company_time_zone) must change together, so it's a setup step.

export interface SettingsInput {
  dailyHoursThreshold: string;
  largeChangeOrderThresholdHours: string;
  inactivityLockMinutes: string;
  pinMaxAttempts: string;
  pinLockoutMinutes: string;
  pinFailuresPerHourLimit: string;
}

export interface SettingsValues {
  daily_hours_threshold: number;
  large_change_order_threshold_hours: number;
  inactivity_lock_minutes: number;
  pin_max_attempts: number;
  pin_lockout_minutes: number;
  pin_failures_per_hour_limit: number;
}

export function checkSettings(input: SettingsInput): Result<SettingsValues> {
  const errors: Record<string, string> = {};
  const halfHours = (key: keyof SettingsInput, min: number, max: number, label: string) => {
    const n = parseNumber(input[key]);
    if (n === null || n < min || n > max || !Number.isInteger(n * 2)) {
      errors[key] = `${label}: ${min} to ${max} hours, in half-hour steps.`;
      return 0;
    }
    return n;
  };
  const whole = (key: keyof SettingsInput, min: number, max: number, label: string) => {
    const n = parseNumber(input[key]);
    if (n === null || !Number.isInteger(n) || n < min || n > max) {
      errors[key] = `${label}: a whole number from ${min} to ${max}.`;
      return 0;
    }
    return n;
  };
  const values: SettingsValues = {
    daily_hours_threshold: halfHours("dailyHoursThreshold", 0.5, 24, "Daily hours warning"),
    large_change_order_threshold_hours: halfHours("largeChangeOrderThresholdHours", 0, 100, "Large change order"),
    inactivity_lock_minutes: whole("inactivityLockMinutes", 1, 120, "Screen lock"),
    pin_max_attempts: whole("pinMaxAttempts", 3, 20, "Wrong PIN tries"),
    pin_lockout_minutes: whole("pinLockoutMinutes", 1, 1440, "Tablet lockout"),
    pin_failures_per_hour_limit: whole("pinFailuresPerHourLimit", 5, 1000, "Wrong PINs per hour"),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: values };
}
