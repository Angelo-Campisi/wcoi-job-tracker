// Core records from spec section 5. Dates are "YYYY-MM-DD" strings (calendar days, no time zone).

export type Role = "lead" | "bookkeeper" | "owner";
export type JobType = "quoted" | "hourly";
export type WorkOrderStatus = "open" | "turned_in" | "approved" | "sent";

export interface Employee {
  id: string;
  name: string;
  active: boolean;
  qboEmployeeId: string | null;
}

/** Wages are effective-dated so a raise never changes past labor cost. */
export interface Wage {
  employeeId: string;
  hourlyWage: number;
  effectiveFrom: string;
}

export interface UserLogin {
  id: string;
  employeeId: string;
  role: Role;
  /** Dev-only PIN. Real PINs are only ever stored hashed. */
  devPin: string;
}

export interface WorkOrderLine {
  description: string;
  quantity: number;
  isLabor: boolean;
}

export interface WorkOrder {
  id: string;
  qboId: string | null;
  quoteNumber: string;
  poNumber: string;
  date: string;
  status: WorkOrderStatus;
  /** Set by bookkeeper/owner to override the automatic job type (decision 1). */
  jobTypeOverride?: JobType | null;
  billTo: { company: string; contact: string; phone: string };
  shipTo: { company: string; address: string; contact: string; phone: string };
  notes: string;
  lines: WorkOrderLine[];
}

export interface JobAssignment {
  workOrderId: string;
  leadUserId: string;
  crewEmployeeIds: string[];
  dates: string[];
}

export interface TimeEntry {
  id: string;
  workOrderId: string;
  employeeId: string;
  date: string;
  hours: number;
  enteredByUserId: string;
}

export type ChangeOrderType = "quick" | "large";
export type ChangeOrderStatus = "pending" | "approved" | "denied";

export interface ChangeOrder {
  id: string;
  workOrderId: string;
  type: ChangeOrderType;
  hoursAdded: number;
  description: string;
  requestedByUserId: string;
  status: ChangeOrderStatus;
  approvedByUserId: string | null;
}

export interface Settings {
  /** Soft warning when one employee's hours for a day go above this (default 8). */
  dailyHoursThreshold: number;
  /** Change orders above this many hours are "large" and need owner approval. */
  largeChangeOrderThresholdHours: number;
  /** Budget reminder levels in percent (default 50 and 80). */
  reminderPercents: number[];
  /** Any Monday that starts a pay period. Periods are 2 weeks from here. */
  payPeriodAnchorMonday: string;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyHoursThreshold: 8,
  largeChangeOrderThresholdHours: 4,
  reminderPercents: [50, 80],
  payPeriodAnchorMonday: "2026-01-05",
};
