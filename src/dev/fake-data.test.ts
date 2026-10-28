import { describe, expect, it } from "vitest";
import { assignments, employees, timeEntries, users, wages, workOrders } from "./fake-data";

const ids = <T extends { id: string }>(rows: T[]) => new Set(rows.map((r) => r.id));

describe("fake data is consistent", () => {
  it("has unique IDs", () => {
    const tables: { id: string }[][] = [employees, users, workOrders, timeEntries];
    for (const rows of tables) {
      expect(ids(rows).size).toBe(rows.length);
    }
  });

  it("only references records that exist", () => {
    const emp = ids(employees);
    const usr = ids(users);
    const wo = ids(workOrders);
    for (const w of wages) expect(emp.has(w.employeeId)).toBe(true);
    for (const u of users) expect(emp.has(u.employeeId)).toBe(true);
    for (const a of assignments) {
      expect(wo.has(a.workOrderId)).toBe(true);
      expect(usr.has(a.leadUserId)).toBe(true);
      for (const e of a.crewEmployeeIds) expect(emp.has(e)).toBe(true);
    }
    for (const t of timeEntries) {
      expect(wo.has(t.workOrderId)).toBe(true);
      expect(emp.has(t.employeeId)).toBe(true);
      expect(usr.has(t.enteredByUserId)).toBe(true);
    }
  });

  it("only logs hours for crew assigned to that job on that date", () => {
    for (const t of timeEntries) {
      const match = assignments.find(
        (a) =>
          a.workOrderId === t.workOrderId &&
          a.crewEmployeeIds.includes(t.employeeId) &&
          a.dates.includes(t.date),
      );
      expect(match, `entry ${t.id}`).toBeDefined();
    }
  });

  it("has at least one active wage for every employee who has hours", () => {
    for (const t of timeEntries) {
      const has = wages.some((w) => w.employeeId === t.employeeId && w.effectiveFrom <= t.date);
      expect(has, `entry ${t.id}`).toBe(true);
    }
  });
});
