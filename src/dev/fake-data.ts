// FAKE data for development and tests only. No real people, customers, or wages.
// Field names follow spec section 5 and will be refined in Phase 1.

export type Role = "lead" | "bookkeeper" | "owner";
export type JobType = "quoted" | "hourly";

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
  effectiveFrom: string; // YYYY-MM-DD
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
  status: "open" | "turned_in" | "approved" | "sent";
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

export const employees: Employee[] = [
  { id: "emp-1", name: "Test Lead Alpha", active: true, qboEmployeeId: null },
  { id: "emp-2", name: "Test Lead Bravo", active: true, qboEmployeeId: null },
  { id: "emp-3", name: "Test Installer Charlie", active: true, qboEmployeeId: null },
  { id: "emp-4", name: "Test Installer Delta", active: true, qboEmployeeId: null },
  { id: "emp-5", name: "Test Installer Echo", active: true, qboEmployeeId: null },
  { id: "emp-6", name: "Test Installer Foxtrot", active: false, qboEmployeeId: null },
  { id: "emp-7", name: "Test Bookkeeper", active: true, qboEmployeeId: null },
  { id: "emp-8", name: "Test Owner", active: true, qboEmployeeId: null },
];

export const wages: Wage[] = [
  { employeeId: "emp-1", hourlyWage: 30, effectiveFrom: "2026-01-01" },
  { employeeId: "emp-2", hourlyWage: 29, effectiveFrom: "2026-01-01" },
  { employeeId: "emp-3", hourlyWage: 22, effectiveFrom: "2026-01-01" },
  // Mid-job raise for testing labor cost (spec section 11).
  { employeeId: "emp-3", hourlyWage: 24, effectiveFrom: "2026-11-04" },
  { employeeId: "emp-4", hourlyWage: 21, effectiveFrom: "2026-01-01" },
  { employeeId: "emp-5", hourlyWage: 20, effectiveFrom: "2026-01-01" },
  { employeeId: "emp-6", hourlyWage: 20, effectiveFrom: "2026-01-01" },
];

export const users: UserLogin[] = [
  { id: "user-lead-a", employeeId: "emp-1", role: "lead", devPin: "1111" },
  { id: "user-lead-b", employeeId: "emp-2", role: "lead", devPin: "2222" },
  { id: "user-bookkeeper", employeeId: "emp-7", role: "bookkeeper", devPin: "7777" },
  { id: "user-owner", employeeId: "emp-8", role: "owner", devPin: "8888" },
];

export const workOrders: WorkOrder[] = [
  {
    id: "wo-1001",
    qboId: null,
    quoteNumber: "Q-5001",
    poNumber: "PO-TEST-01",
    date: "2026-11-02",
    status: "open",
    billTo: { company: "Example Furniture Dealer", contact: "Pat Sample", phone: "555-0100" },
    shipTo: {
      company: "Example Law Office",
      address: "100 Test St, Suite 200, Testville",
      contact: "Sam Placeholder",
      phone: "555-0101",
    },
    notes: "Use freight elevator. Badge in at front desk.",
    lines: [
      { description: "Install 12 workstations", quantity: 24, isLabor: true },
      { description: "Remove old cubicles", quantity: 8, isLabor: true },
      { description: "Fuel surcharge", quantity: 1, isLabor: false },
    ],
  },
  {
    id: "wo-1002",
    qboId: null,
    quoteNumber: "Q-5002",
    poNumber: "PO-TEST-02",
    date: "2026-11-03",
    status: "open",
    billTo: { company: "Example Property Group", contact: "Jordan Demo", phone: "555-0200" },
    shipTo: {
      company: "Example Property Group",
      address: "200 Sample Ave, Building B, Testville",
      contact: "Riley Mock",
      phone: "555-0201",
    },
    notes: "Hourly move between buildings A and B.",
    // Hourly job: no labor quantities, only a non-labor line.
    lines: [
      { description: "Move furniture, billed hourly", quantity: 0, isLabor: true },
      { description: "Fuel surcharge", quantity: 1, isLabor: false },
    ],
  },
  {
    id: "wo-1003",
    qboId: null,
    quoteNumber: "Q-5003",
    poNumber: "PO-TEST-03",
    date: "2026-11-03",
    status: "open",
    billTo: { company: "Example Furniture Dealer", contact: "Pat Sample", phone: "555-0100" },
    shipTo: {
      company: "Example Medical Clinic",
      address: "300 Fake Rd, Testville",
      contact: "Casey Example",
      phone: "555-0301",
    },
    notes: "",
    lines: [{ description: "Receive and install reception desk", quantity: 6, isLabor: true }],
  },
];

export const assignments: JobAssignment[] = [
  {
    workOrderId: "wo-1001",
    leadUserId: "user-lead-a",
    crewEmployeeIds: ["emp-1", "emp-3", "emp-4"],
    dates: ["2026-11-02", "2026-11-03", "2026-11-04"],
  },
  {
    workOrderId: "wo-1002",
    leadUserId: "user-lead-b",
    crewEmployeeIds: ["emp-2", "emp-5"],
    dates: ["2026-11-03"],
  },
  {
    // emp-4 works two jobs on 2026-11-03 (spec 6.3).
    workOrderId: "wo-1003",
    leadUserId: "user-lead-b",
    crewEmployeeIds: ["emp-2", "emp-4"],
    dates: ["2026-11-03"],
  },
];

export const timeEntries: TimeEntry[] = [
  { id: "te-1", workOrderId: "wo-1001", employeeId: "emp-1", date: "2026-11-02", hours: 8, enteredByUserId: "user-lead-a" },
  { id: "te-2", workOrderId: "wo-1001", employeeId: "emp-3", date: "2026-11-02", hours: 8, enteredByUserId: "user-lead-a" },
  { id: "te-3", workOrderId: "wo-1001", employeeId: "emp-4", date: "2026-11-02", hours: 7.5, enteredByUserId: "user-lead-a" },
  { id: "te-4", workOrderId: "wo-1001", employeeId: "emp-4", date: "2026-11-03", hours: 5, enteredByUserId: "user-lead-a" },
  // emp-4 then goes to wo-1003: 5 + 4 = 9 hours that day, over the 8-hour flag.
  { id: "te-5", workOrderId: "wo-1003", employeeId: "emp-4", date: "2026-11-03", hours: 4, enteredByUserId: "user-lead-b" },
  { id: "te-6", workOrderId: "wo-1002", employeeId: "emp-2", date: "2026-11-03", hours: 6, enteredByUserId: "user-lead-b" },
  { id: "te-7", workOrderId: "wo-1002", employeeId: "emp-5", date: "2026-11-03", hours: 6, enteredByUserId: "user-lead-b" },
  // After emp-3's raise on 2026-11-04.
  { id: "te-8", workOrderId: "wo-1001", employeeId: "emp-3", date: "2026-11-04", hours: 8, enteredByUserId: "user-lead-a" },
];
