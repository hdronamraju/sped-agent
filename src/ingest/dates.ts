import { fromUTC, isValidISO, type ISODate } from "../rules/dates";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function mk(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidISO(iso) ? iso : null;
}

/** Excel serial day numbers (1900 date system). 46000 ≈ Dec 2025. */
function fromExcelSerial(n: number): ISODate | null {
  if (n < 20000 || n > 80000) return null;
  return fromUTC(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000);
}

/**
 * Parse the date formats coordinators' files actually contain.
 * Slash dates are read US-style (M/D) unless the first number can't be a month.
 */
export function parseDate(value: unknown): ISODate | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return fromUTC(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number") return fromExcelSerial(value);
  const s = String(value).trim().replace(/\s+/g, " ");
  if (!s) return null;

  let m: RegExpMatchArray | null;
  // 2026-10-09, 2026/10/09, 2026-10-09T00:00:00
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/))) return mk(+m[1], +m[2], +m[3]);
  // 10/9/2026, 10-9-26, 10.09.2026
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?: .*)?$/))) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12 && b <= 12) return mk(y, b, a);
    return mk(y, a, b);
  }
  // 20261009
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return mk(+m[1], +m[2], +m[3]);
  // Oct 9, 2026 / October 9 2026 / Fri, Oct 9, 2026
  if ((m = s.match(/^(?:[a-z]+,? )?([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{2,4})$/i)) && MONTHS[m[1].toLowerCase()])
    return mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  // 9 Oct 2026 / 9-Oct-26
  if ((m = s.match(/^(\d{1,2})[ -]([a-z]+)\.?[ ,-]+(\d{2,4})$/i)) && MONTHS[m[2].toLowerCase()])
    return mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  // Excel serial typed as text
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  return null;
}

export function looksLikeDate(value: unknown): boolean {
  return parseDate(value) !== null;
}
