import { addDays, addYears, isWeekend, type ISODate } from "./dates";

/**
 * A district's calendar for one school year, as the coordinator confirmed it.
 * Breaks are the district's declared non-school days inside the year
 * (holidays, Thanksgiving, winter break, spring break, furlough days).
 */
export interface SchoolYear {
  id: string; // e.g. "2026-27"
  firstDay: ISODate; // first day of instruction
  lastDay: ISODate; // last day of instruction
  breaks: Break[];
  confirmedBy?: string;
  confirmedAt?: string;
  source?: string; // file name or URL the calendar came from
}

export interface Break {
  name: string;
  start: ISODate;
  end: ISODate; // inclusive
}

export interface DistrictCalendar {
  districtName: string;
  years: SchoolYear[];
}

/** A stretch of days a California clock does not count, with the reason shown to the coordinator. */
export interface ExcludedSpan {
  from: ISODate;
  to: ISODate;
  reason: string;
  kind: "between-sessions" | "vacation";
  provisional?: boolean;
}

export const VACATION_THRESHOLD_SCHOOL_DAYS = 5;

export function sortedYears(cal: DistrictCalendar): SchoolYear[] {
  return [...cal.years].sort((a, b) => a.firstDay.localeCompare(b.firstDay));
}

export function yearContaining(cal: DistrictCalendar, d: ISODate): SchoolYear | undefined {
  return cal.years.find((y) => y.firstDay <= d && d <= y.lastDay);
}

function inBreak(year: SchoolYear, d: ISODate): Break | undefined {
  return year.breaks.find((b) => b.start <= d && d <= b.end);
}

export function isSchoolDay(cal: DistrictCalendar, d: ISODate): boolean {
  const y = yearContaining(cal, d);
  return !!y && !isWeekend(d) && !inBreak(y, d);
}

/**
 * Merge declared breaks that overlap or touch (including across a weekend),
 * so "winter break" plus an adjoining "New Year's Day" holiday is one vacation.
 */
export function mergedBreaks(year: SchoolYear): Break[] {
  const sorted = [...year.breaks].sort((a, b) => a.start.localeCompare(b.start));
  const out: Break[] = [];
  for (const b of sorted) {
    const prev = out.at(-1);
    if (prev && touches(prev.end, b.start)) {
      if (b.end > prev.end) prev.end = b.end;
      prev.name = prev.name === b.name ? prev.name : `${prev.name} + ${b.name}`;
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

function touches(end: ISODate, nextStart: ISODate): boolean {
  if (nextStart <= addDays(end, 1)) return true;
  // Only weekend days between them.
  for (let d = addDays(end, 1); d < nextStart; d = addDays(d, 1)) {
    if (!isWeekend(d)) return false;
  }
  return true;
}

/** Weekdays inside a break: the school days the break replaced. */
export function schoolDaysInBreak(b: Break): number {
  let n = 0;
  for (let d = b.start; d <= b.end; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return n;
}

/**
 * Every span a California clock skips: days between regular sessions (summer)
 * and school vacations longer than 5 school days.
 *
 * Interpretation (conservative, documented in the rules): a qualifying vacation
 * skips the declared break dates only. Weekends just before or after the break
 * still count, so the computed deadline is never later than any common reading.
 *
 * If the next year's calendar isn't loaded, the summer gap is estimated (first
 * weekday on or after the same month/day as this year's first day, a year later)
 * and marked provisional.
 */
export function excludedSpans(cal: DistrictCalendar): ExcludedSpan[] {
  const years = sortedYears(cal);
  const spans: ExcludedSpan[] = [];
  years.forEach((y, i) => {
    for (const b of mergedBreaks(y)) {
      const n = schoolDaysInBreak(b);
      if (n > VACATION_THRESHOLD_SCHOOL_DAYS) {
        spans.push({
          from: b.start,
          to: b.end,
          kind: "vacation",
          reason: `${b.name} (${n} school days, more than 5)`,
        });
      }
    }
    const next = years[i + 1];
    if (next) {
      spans.push({
        from: addDays(y.lastDay, 1),
        to: addDays(next.firstDay, -1),
        kind: "between-sessions",
        reason: `Between sessions (${y.id} → ${next.id})`,
      });
    } else {
      const est = estimatedNextFirstDay(y);
      spans.push({
        from: addDays(y.lastDay, 1),
        to: addDays(est, -1),
        kind: "between-sessions",
        reason: `Between sessions (next year's calendar not loaded; first day estimated as ${est})`,
        provisional: true,
      });
    }
  });
  // Days before the first loaded year are unknown; treat them as counted.
  return spans.sort((a, b) => a.from.localeCompare(b.from));
}

export function estimatedNextFirstDay(y: SchoolYear): ISODate {
  let d = addYears(y.firstDay, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export function nextYearFirstDay(cal: DistrictCalendar, after: ISODate): { date: ISODate; provisional: boolean } | undefined {
  const years = sortedYears(cal);
  const next = years.find((y) => y.firstDay > after);
  if (next) return { date: next.firstDay, provisional: false };
  const last = years.at(-1);
  if (!last || last.lastDay > after) return undefined;
  return { date: estimatedNextFirstDay(last), provisional: true };
}

/** The year whose session (or the summer after it) contains d. */
export function yearForDate(cal: DistrictCalendar, d: ISODate): SchoolYear | undefined {
  const years = sortedYears(cal);
  return yearContaining(cal, d) ?? [...years].reverse().find((y) => y.firstDay <= d);
}

export function spanContaining(spans: ExcludedSpan[], d: ISODate): ExcludedSpan | undefined {
  return spans.find((s) => s.from <= d && d <= s.to);
}

export interface CountResult {
  end: ISODate;
  skipped: ExcludedSpan[];
  provisional: boolean;
}

/**
 * Count n "California days" from start: calendar days, skipping excluded spans.
 * The start day is day 0. Negative n counts backward.
 */
export function countCaliforniaDays(cal: DistrictCalendar, start: ISODate, n: number): CountResult {
  const spans = excludedSpans(cal);
  const skipped: ExcludedSpan[] = [];
  const step = n >= 0 ? 1 : -1;
  let d = start;
  let counted = 0;
  while (counted < Math.abs(n)) {
    d = addDays(d, step);
    const s = spanContaining(spans, d);
    if (s) {
      if (!skipped.includes(s)) skipped.push(s);
      d = step > 0 ? s.to : s.from; // jump past the span; the loop steps once more
      continue;
    }
    counted++;
  }
  return { end: d, skipped, provisional: skipped.some((s) => s.provisional) };
}

/** Count n school days after start (start is day 0). Negative n counts backward. */
export function addSchoolDays(cal: DistrictCalendar, start: ISODate, n: number): ISODate {
  const step = n >= 0 ? 1 : -1;
  let d = start;
  let left = Math.abs(n);
  let guard = 0;
  while (left > 0 && guard++ < 2000) {
    d = addDays(d, step);
    if (isSchoolDay(cal, d)) left--;
  }
  return d;
}

/** Last school day on or before d (d itself when it's a school day). */
export function schoolDayOnOrBefore(cal: DistrictCalendar, d: ISODate): ISODate {
  let x = d;
  let guard = 0;
  while (!isSchoolDay(cal, x) && guard++ < 400) x = addDays(x, -1);
  return guard >= 400 ? d : x;
}

/** School days strictly after a, up to and including b. */
export function schoolDaysBetween(cal: DistrictCalendar, a: ISODate, b: ISODate): number {
  if (a === b) return 0;
  if (b < a) return -schoolDaysBetween(cal, b, a);
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isSchoolDay(cal, d)) n++;
  return n;
}
