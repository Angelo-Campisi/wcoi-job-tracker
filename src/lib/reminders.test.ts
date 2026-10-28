import { describe, expect, it } from "vitest";
import { checkReminders, type ReminderLevel } from "./reminders";

const LEVELS = [50, 80];

/** Runs a sequence of hours-used values through the checker, like hours being entered over days. */
function simulate(steps: { used: number; budget: number }[]) {
  let fired: ReminderLevel[] = [];
  const sent: ReminderLevel[][] = [];
  for (const s of steps) {
    const r = checkReminders("quoted", s.used, s.budget, LEVELS, fired);
    fired = r.firedLevels;
    sent.push(r.fire);
  }
  return sent;
}

describe("budget reminders", () => {
  it("fires 50% and 80% once each as hours climb", () => {
    const sent = simulate([
      { used: 4, budget: 10 },
      { used: 5, budget: 10 },
      { used: 6, budget: 10 },
      { used: 8, budget: 10 },
      { used: 9, budget: 10 },
      { used: 10, budget: 10 },
    ]);
    expect(sent).toEqual([[], [50], [], [80], [], []]);
  });

  it("fires both at once if one entry jumps past both", () => {
    expect(simulate([{ used: 9, budget: 10 }])).toEqual([[50, 80]]);
  });

  it("fires an over-budget alert once above 100%", () => {
    const sent = simulate([
      { used: 10, budget: 10 },
      { used: 10.25, budget: 10 },
      { used: 12, budget: 10 },
    ]);
    expect(sent).toEqual([[50, 80], ["over"], []]);
  });

  it("re-arms a level after a change order raises the budget (decision 4)", () => {
    const sent = simulate([
      { used: 8, budget: 10 }, // 80%: fires 50 and 80
      { used: 8, budget: 14 }, // change order: 57%, 80 re-arms
      { used: 12, budget: 14 }, // 86%: 80 fires again
    ]);
    expect(sent).toEqual([[50, 80], [], [80]]);
  });

  it("sends nothing for hourly jobs", () => {
    expect(checkReminders("hourly", 50, 10, LEVELS, [])).toEqual({ fire: [], firedLevels: [] });
  });

  it("sends nothing when there is no budget", () => {
    expect(checkReminders("quoted", 5, 0, LEVELS, []).fire).toEqual([]);
  });

  it("uses the owner's reminder levels", () => {
    expect(checkReminders("quoted", 7.5, 10, [25, 75, 90], []).fire).toEqual([25, 75]);
  });
});
