import { addDays, isValidISO, type ISODate } from "../rules/dates";
import type { Break, SchoolYear } from "../rules/schoolDays";

/** One dated item found in a calendar file, before the coordinator confirms it. */
export interface FoundEvent {
  name: string;
  start: ISODate;
  end: ISODate; // inclusive
  role: "first-day" | "last-day" | "break" | "ignore";
}

const FIRST_DAY = /first day|school (begins|starts|opens)|classes (begin|start)|instruction begins|primer d[ií]a/i;
const LAST_DAY = /last day( of (school|instruction|classes))?|school ends|end of (school )?year|[uú]ltimo d[ií]a/i;
const NON_SCHOOL =
  /break|holiday|recess|no school|vacation|day off|non[- ]?(student|school|instructional)|student free|furlough|labor day|veterans|thanksgiving|winter|spring|mlk|king|president|lincoln|washington|memorial|ch[aá]vez|independence|new year|christmas|admission day|juneteenth|indigenous|columbus|no classes|schools closed|vacaciones|d[ií]a festivo/i;
const NOT_A_BREAK = /minimum day|early (release|dismissal)|back to school|open house|conference|night|picture|rally|testing|exam/i;

export function classify(name: string): FoundEvent["role"] {
  if (FIRST_DAY.test(name)) return "first-day";
  if (LAST_DAY.test(name)) return "last-day";
  if (NOT_A_BREAK.test(name) && !/no school/i.test(name)) return "ignore";
  if (NON_SCHOOL.test(name)) return "break";
  return "ignore";
}

export interface ProposedYear {
  year: SchoolYear;
  events: FoundEvent[];
  warnings: string[];
}

/** Build a school year proposal from found events; the coordinator confirms or edits it. */
export function proposeYear(events: FoundEvent[], source: string): ProposedYear {
  const warnings: string[] = [];
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const first = sorted.find((e) => e.role === "first-day");
  const last = [...sorted].reverse().find((e) => e.role === "last-day");
  const breaks: Break[] = sorted.filter((e) => e.role === "break").map((e) => ({ name: e.name, start: e.start, end: e.end }));

  let firstDay = first?.start;
  let lastDay = last?.start;
  if (!firstDay) {
    const b = breaks[0];
    firstDay = b ? `${Number(b.start.slice(0, 4)) - (b.start.slice(5, 7) < "08" ? 1 : 0)}-08-15` : "2026-08-13";
    warnings.push("Couldn't find the first day of school. Please enter it.");
  }
  if (!lastDay) {
    lastDay = `${Number(firstDay.slice(0, 4)) + 1}-06-05`;
    warnings.push("Couldn't find the last day of school. Please enter it.");
  }
  const inYear = breaks.filter((b) => b.end >= firstDay! && b.start <= lastDay!);
  if (inYear.length < breaks.length) warnings.push(`${breaks.length - inYear.length} break(s) fell outside the school year and were left out.`);
  if (!inYear.some((b) => /winter|christmas|navidad/i.test(b.name))) warnings.push("No winter break found. Check that it's listed.");

  const y1 = Number(firstDay.slice(0, 4));
  return {
    year: { id: `${y1}-${String(y1 + 1).slice(2)}`, firstDay, lastDay, breaks: inYear, source },
    events: sorted,
    warnings,
  };
}

// ── Text extraction (PDF and web pages) ────────────────────────────────────

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DASH = "\\s*(?:-|–|—|to|through|thru)\\s*";

function monthNum(s: string): number {
  return MONTH_NUM[s.slice(0, 3).toLowerCase()];
}

/** Detect "2026-27" / "2026-2027" so month-day dates without a year can be placed. */
export function detectSchoolYear(text: string): number | undefined {
  const m = text.match(/\b(20\d{2})\s*[-–/]\s*(?:20)?(\d{2})\b/);
  if (m && (Number(m[2]) === (Number(m[1]) + 1) % 100)) return Number(m[1]);
  const y = text.match(/\b(20\d{2})\b/);
  return y ? Number(y[1]) : undefined;
}

function iso(y: number, m: number, d: number): ISODate | null {
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidISO(s) ? s : null;
}

/** School-year aware year for a month: Aug–Dec → first year, Jan–Jul → second. */
function yearFor(m: number, startYear: number, explicit?: string): number {
  if (explicit) return Number(explicit.length === 2 ? `20${explicit}` : explicit);
  return m >= 8 ? startYear : startYear + 1;
}

/**
 * Find dates and date ranges in lines of calendar text, e.g.
 *   "Winter Break: December 21, 2026 – January 1, 2027"
 *   "Nov. 23-27 Thanksgiving Recess"
 *   "12/21/26 - 1/1/27 Winter Recess"
 */
export function eventsFromText(lines: string[], startYear: number): FoundEvent[] {
  const out: FoundEvent[] = [];
  const re = new RegExp(
    [
      // Month D[, YYYY] – Month D[, YYYY]
      `\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?${DASH}${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
      // Month D–D[, YYYY]
      `\\b${MONTH}\\.?\\s+(\\d{1,2})${DASH}(\\d{1,2})(?:,?\\s*(\\d{4}))?`,
      // M/D[/YY] – M/D[/YY]
      `(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${DASH}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`,
      // Month D[, YYYY]
      `\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
      // M/D[/YY]
      `(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`,
    ].join("|"),
    "gi",
  );
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    const found: { start: ISODate; end: ISODate; at: number; len: number }[] = [];
    while ((m = re.exec(line))) {
      const g = m.slice(1);
      let start: ISODate | null = null;
      let end: ISODate | null = null;
      if (g[0]) {
        const m1 = monthNum(g[0]), m2 = monthNum(g[3]);
        start = iso(yearFor(m1, startYear, g[2]), m1, +g[1]);
        end = iso(yearFor(m2, startYear, g[5]), m2, +g[4]);
      } else if (g[6]) {
        const mm = monthNum(g[6]);
        const y = yearFor(mm, startYear, g[9]);
        start = iso(y, mm, +g[7]);
        end = iso(y, mm, +g[8]);
      } else if (g[10]) {
        start = iso(yearFor(+g[10], startYear, g[12]), +g[10], +g[11]);
        end = iso(yearFor(+g[13], startYear, g[15]), +g[13], +g[14]);
      } else if (g[16]) {
        const mm = monthNum(g[16]);
        start = end = iso(yearFor(mm, startYear, g[18]), mm, +g[17]);
      } else if (g[19]) {
        start = end = iso(yearFor(+g[19], startYear, g[21]), +g[19], +g[20]);
      }
      if (start && end && end >= start && end <= addDays(start, 30)) found.push({ start, end, at: m.index, len: m[0].length });
    }
    if (!found.length) continue;
    // Label: the line without its dates and separators.
    let label = line;
    for (const f of [...found].reverse()) label = label.slice(0, f.at) + " " + label.slice(f.at + f.len);
    label = label.replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?/gi, " ").replace(/[–—:|,;()-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!label) label = "Non-school day";
    for (const f of found) out.push({ name: label, start: f.start, end: f.end, role: classify(label) });
  }
  return dedupe(out);
}

function dedupe(events: FoundEvent[]): FoundEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = `${e.start}|${e.end}|${e.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function htmlToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
  const text = (doc.body as HTMLElement | null)?.innerText ?? doc.body?.textContent ?? "";
  return text.split(/\n+/);
}
