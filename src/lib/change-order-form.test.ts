import { describe, expect, it } from "vitest";
import { changeOrderPreview, changeOrderProblem, parseHours, stepChangeHours } from "./change-order-form";

describe("hours buttons", () => {
  it("+ on empty starts at 1, then half-hour steps", () => {
    expect(stepChangeHours(null, 1)).toBe(1);
    expect(stepChangeHours(1, 1)).toBe(1.5);
    expect(stepChangeHours(1.5, -1)).toBe(1);
  });

  it("goes back to empty below half an hour", () => {
    expect(stepChangeHours(0.5, -1)).toBeNull();
    expect(stepChangeHours(null, -1)).toBeNull();
  });
});

describe("typed hours", () => {
  it("reads whole and half hours, with a dot or comma", () => {
    expect(parseHours("6")).toBe(6);
    expect(parseHours(" 6.5 ")).toBe(6.5);
    expect(parseHours("6,5")).toBe(6.5);
  });

  it("is empty for blank or unreadable text", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours("abc")).toBeNull();
    expect(parseHours("-2")).toBeNull();
  });
});

describe("checking a change order", () => {
  it("needs hours in half-hour steps and a description", () => {
    expect(changeOrderProblem(null, "x")).toMatch(/extra hours/);
    expect(changeOrderProblem(2.25, "x")).toMatch(/half-hour/);
    expect(changeOrderProblem(2, "  ")).toMatch(/what changed/);
    expect(changeOrderProblem(501, "x")).toMatch(/more than 500/);
    expect(changeOrderProblem(2.5, "Two more desks")).toBeNull();
  });
});

describe("preview", () => {
  it("exactly the threshold is quick, above is large", () => {
    expect(changeOrderPreview(4, 4, false).type).toBe("quick");
    expect(changeOrderPreview(4.5, 4, false).type).toBe("large");
  });

  it("explains what happens next", () => {
    expect(changeOrderPreview(2, 4, false).text).toMatch(/added to the budget right away/);
    expect(changeOrderPreview(10, 4, false).text).toMatch(/owner must approve/);
    expect(changeOrderPreview(null, 4, false).text).toMatch(/Up to 4 hrs/);
  });

  it("says hourly-job change orders are a record only", () => {
    expect(changeOrderPreview(2, 4, true).text).toMatch(/record/);
  });
});
