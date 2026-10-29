import { describe, expect, it } from "vitest";
import { checkName, checkSettings, checkWage, checkWorkOrder, isRealDate, parseNumber, type WorkOrderFormInput } from "./office-forms";

const blankWo: WorkOrderFormInput = {
  quoteNumber: "Q-1",
  poNumber: "",
  orderDate: "2026-11-10",
  jobTypeOverride: "",
  billToCompany: "Dealer",
  billToContact: "",
  billToPhone: "",
  shipToCompany: "Law Office",
  shipToAddress: "1 Main St",
  shipToContact: "Sam",
  shipToPhone: "402-555-0101",
  notes: "",
  lines: [
    { description: "Install desks", quantity: "12", isLabor: true },
    { description: " ", quantity: "", isLabor: true }, // empty row, ignored
    { description: "Fuel surcharge", quantity: "1", isLabor: false },
  ],
};

describe("basics", () => {
  it("knows real dates", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("11/10/2026")).toBe(false);
  });

  it("reads typed numbers", () => {
    expect(parseNumber("12")).toBe(12);
    expect(parseNumber("$22.50")).toBe(22.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("work order form", () => {
  it("accepts a good work order, trims text, numbers lines, and skips empty rows", () => {
    const result = checkWorkOrder({ ...blankWo, shipToCompany: "  Law Office " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ship_to_company).toBe("Law Office");
    expect(result.value.job_type_override).toBeNull();
    expect(result.value.lines).toEqual([
      { line_number: 1, description: "Install desks", quantity: 12, is_labor: true },
      { line_number: 2, description: "Fuel surcharge", quantity: 1, is_labor: false },
    ]);
  });

  it("needs a date, a customer, and a job site address", () => {
    const result = checkWorkOrder({ ...blankWo, orderDate: "", shipToCompany: "", billToCompany: "", shipToAddress: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["orderDate", "shipToAddress", "shipToCompany"]);
  });

  it("each line needs a description and a number", () => {
    const result = checkWorkOrder({ ...blankWo, lines: [{ description: "", quantity: "4", isLabor: true }, { description: "X", quantity: "lots", isLabor: true }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.line0).toMatch(/describe the work/);
    expect(result.errors.line1).toMatch(/should be a number/);
  });

  it("keeps a job type override", () => {
    const result = checkWorkOrder({ ...blankWo, jobTypeOverride: "hourly" });
    expect(result.ok && result.value.job_type_override).toBe("hourly");
  });
});

describe("people", () => {
  it("needs a name", () => {
    expect(checkName(" ")).toMatch(/Enter/);
    expect(checkName("Pat Doe")).toBeNull();
  });

  it("wages are dollars and cents with a start date", () => {
    expect(checkWage("22.50", "2026-11-01")).toEqual({ ok: true, value: { hourly_wage: 22.5, effective_from: "2026-11-01" } });
    expect(checkWage("0", "2026-11-01").ok).toBe(false);
    expect(checkWage("22.505", "2026-11-01").ok).toBe(false);
    expect(checkWage("900", "2026-11-01").ok).toBe(false);
    expect(checkWage("22", "").ok).toBe(false);
  });
});

describe("settings", () => {
  const good = {
    dailyHoursThreshold: "8",
    largeChangeOrderThresholdHours: "4",
    inactivityLockMinutes: "5",
    pinMaxAttempts: "5",
    pinLockoutMinutes: "15",
    pinFailuresPerHourLimit: "30",
  };

  it("accepts the current settings", () => {
    expect(checkSettings(good).ok).toBe(true);
  });

  it("refuses out-of-range values with a message for each", () => {
    const result = checkSettings({ ...good, dailyHoursThreshold: "8.25", inactivityLockMinutes: "0", pinMaxAttempts: "2" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["dailyHoursThreshold", "inactivityLockMinutes", "pinMaxAttempts"]);
  });
});
