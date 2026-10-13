import type { ISODate } from "../rules/dates";

/** All meetings are California meetings. */
export const TZ = "America/Los_Angeles";

/** UTC milliseconds for a California wall-clock time. */
export function laToUtc(date: ISODate, hhmm: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Offset of LA at that instant (handles DST).
  const offset = tzOffsetMinutes(guess);
  const first = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(first);
  return guess - offset2 * 60_000;
}

function tzOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** "2027-01-13T15:30:00" local, as calendar APIs want with an explicit time zone. */
export function localDateTime(date: ISODate, hhmm: string): string {
  return `${date}T${hhmm}:00`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** "3:30 PM" */
export function fmtTime(hhmm: string, lang = "en"): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (lang !== "en") return `${h}:${String(m).padStart(2, "0")}`;
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}
