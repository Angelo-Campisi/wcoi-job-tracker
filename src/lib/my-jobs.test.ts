import { describe, expect, it } from "vitest";
import { budgetStatusLabel, datesSummary, formatHours, groupJobs, shortDate, todayIn } from "./my-jobs";

const job = (id: string, dates: string[]) => ({ id, dates });

describe("grouping jobs", () => {
  const today = "2026-11-03";

  it("puts today's jobs first, then upcoming, past, and not scheduled", () => {
    const groups = groupJobs(
      [job("past", ["2026-11-01"]), job("now", ["2026-11-03"]), job("soon", ["2026-11-05"]), job("none", [])],
      today,
    );
    expect(groups.today.map((j) => j.id)).toEqual(["now"]);
    expect(groups.upcoming.map((j) => j.id)).toEqual(["soon"]);
    expect(groups.past.map((j) => j.id)).toEqual(["past"]);
    expect(groups.unscheduled.map((j) => j.id)).toEqual(["none"]);
  });

  it("a multi-day job running today is a today job", () => {
    const groups = groupJobs([job("run", ["2026-11-02", "2026-11-03", "2026-11-04"])], today);
    expect(groups.today.map((j) => j.id)).toEqual(["run"]);
  });

  it("a job that started earlier and continues later is upcoming, not past", () => {
    const groups = groupJobs([job("gap", ["2026-11-01", "2026-11-06"])], today);
    expect(groups.upcoming.map((j) => j.id)).toEqual(["gap"]);
  });

  it("sorts upcoming soonest first and past most recent first", () => {
    const groups = groupJobs(
      [
        job("later", ["2026-11-10"]),
        job("sooner", ["2026-11-04"]),
        job("old", ["2026-10-01"]),
        job("recent", ["2026-10-20", "2026-11-02"]),
      ],
      today,
    );
    expect(groups.upcoming.map((j) => j.id)).toEqual(["sooner", "later"]);
    expect(groups.past.map((j) => j.id)).toEqual(["recent", "old"]);
  });
});

describe("today's date", () => {
  it("uses the company's time zone, not the server's", () => {
    // 2026-11-03 03:00 UTC is still the evening of Nov 2 in New York.
    const now = new Date("2026-11-03T03:00:00Z");
    expect(todayIn("America/New_York", now)).toBe("2026-11-02");
    expect(todayIn("UTC", now)).toBe("2026-11-03");
  });
});

describe("card text", () => {
  it("shows short dates", () => {
    expect(shortDate("2026-11-02")).toBe("Mon, Nov 2");
  });

  it("shows the days from today on, cut short when long", () => {
    const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    expect(datesSummary(dates, "2026-11-03")).toBe("Tue, Nov 3 · Wed, Nov 4 · Thu, Nov 5 +1 more");
  });

  it("shows the last days of a past job", () => {
    expect(datesSummary(["2026-10-01", "2026-10-02"], "2026-11-03")).toBe("Thu, Oct 1 · Fri, Oct 2");
  });

  it("formats hours without trailing zeros", () => {
    expect(formatHours(8)).toBe("8");
    expect(formatHours(7.5)).toBe("7.5");
    expect(formatHours(28.5)).toBe("28.5");
  });

  it("describes budget status in words", () => {
    expect(budgetStatusLabel("under_50")).toEqual({ label: "On track", tone: "good" });
    expect(budgetStatusLabel("at_80").tone).toBe("warn");
    expect(budgetStatusLabel("over")).toEqual({ label: "Over budget", tone: "bad" });
  });
});
