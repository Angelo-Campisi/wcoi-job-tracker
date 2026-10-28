import { describe, expect, it } from "vitest";
import { addDays, payPeriod, payday, weekStart } from "./dates";

describe("weekStart (Monday–Sunday weeks)", () => {
  it("returns the same day for a Monday", () => {
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });
  it("returns the previous Monday for a Sunday", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
  });
  it("works across a month and year boundary", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
  it("is not shifted by the daylight saving change (Nov 1, 2026)", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  });
  it("rejects bad dates", () => {
    expect(() => weekStart("2026-02-30")).toThrow();
    expect(() => weekStart("11/02/2026")).toThrow();
  });
});

describe("pay periods (two weeks, paid the Wednesday after)", () => {
  const anchor = "2026-01-05";
  it("finds the period containing a date", () => {
    expect(payPeriod("2026-01-05", anchor)).toEqual({ start: "2026-01-05", end: "2026-01-18" });
    expect(payPeriod("2026-01-18", anchor)).toEqual({ start: "2026-01-05", end: "2026-01-18" });
    expect(payPeriod("2026-01-19", anchor)).toEqual({ start: "2026-01-19", end: "2026-02-01" });
  });
  it("works for dates before the anchor", () => {
    expect(payPeriod("2026-01-04", anchor)).toEqual({ start: "2025-12-22", end: "2026-01-04" });
  });
  it("pays on the Wednesday after the period ends", () => {
    expect(payday("2026-01-18")).toBe("2026-01-21");
  });
  it("refuses an anchor that is not a Monday", () => {
    expect(() => payPeriod("2026-01-10", "2026-01-06")).toThrow();
  });
});
