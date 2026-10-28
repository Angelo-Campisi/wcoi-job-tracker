// Calendar-day helpers. All dates are "YYYY-MM-DD" and math is done in UTC
// so the result never shifts with the tablet's time zone or daylight saving.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(date: string): number {
  if (!DATE_RE.test(date)) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date "${date}"`);
  }
  return ms;
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** The Monday that starts the Monday–Sunday week containing `date`. */
export function weekStart(date: string): string {
  const dayOfWeek = new Date(toUtc(date)).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dayOfWeek + 6) % 7;
  return addDays(date, -sinceMonday);
}

/** The two-week pay period containing `date`, counted from an anchor Monday. */
export function payPeriod(date: string, anchorMonday: string): { start: string; end: string } {
  if (weekStart(anchorMonday) !== anchorMonday) {
    throw new Error(`Pay period anchor ${anchorMonday} is not a Monday`);
  }
  const offset = daysBetween(anchorMonday, date);
  const periodIndex = Math.floor(offset / 14);
  const start = addDays(anchorMonday, periodIndex * 14);
  return { start, end: addDays(start, 13) };
}

/** Payday: the Wednesday after the pay period ends (assumption 16). */
export function payday(periodEnd: string): string {
  return addDays(periodEnd, 3);
}
