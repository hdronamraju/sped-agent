// Plain ISO dates ("YYYY-MM-DD") with UTC arithmetic, so time zones and DST never shift a deadline.

export type ISODate = string;

const DAY_MS = 86_400_000;

export function toUTC(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY_MS);
}

/** Calendar days from a to b (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

export function isWeekend(d: ISODate): boolean {
  const w = weekday(d);
  return w === 0 || w === 6;
}

/** Same month/day n years later; Feb 29 becomes Feb 28 in non-leap years. */
export function addYears(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const ty = y + n;
  const lastOfMonth = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return fromUTC(Date.UTC(ty, m - 1, Math.min(day, lastOfMonth)));
}

export function isValidISO(d: unknown): d is ISODate {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return fromUTC(toUTC(d)) === d;
}

export function minDate(...ds: (ISODate | undefined)[]): ISODate | undefined {
  return ds.filter(Boolean).sort()[0];
}

export function maxDate(...ds: (ISODate | undefined)[]): ISODate | undefined {
  return ds.filter(Boolean).sort().at(-1);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed, Jan 13, 2027" */
export function fmt(d: ISODate | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${DOW[weekday(d)]}, ${MONTHS[m - 1]} ${day}, ${y}`;
}

export function fmtShort(d: ISODate | undefined): string {
  if (!d) return "—";
  const [, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
