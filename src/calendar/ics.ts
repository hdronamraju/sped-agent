import { addDays, type ISODate } from "../rules/dates";
import { classify, type FoundEvent } from "./extract";

/** Minimal iCalendar reader: all-day and timed VEVENTs, folded lines, DTEND exclusive. */
export function eventsFromIcs(text: string): FoundEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: FoundEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = icsDate(cur.DTSTART);
      if (start) {
        const allDay = /^\d{8}$/.test(cur.DTSTART ?? "");
        let end = icsDate(cur.DTEND) ?? start;
        // All-day DTEND is exclusive.
        if (allDay && cur.DTEND && end > start) end = addDays(end, -1);
        const name = unescape(cur.SUMMARY ?? "Event");
        out.push({ name, start, end: end < start ? start : end, role: classify(name) });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i > 0) {
        const key = line.slice(0, i).split(";")[0].toUpperCase();
        cur[key] = line.slice(i + 1);
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

function icsDate(v?: string): ISODate | null {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Export a confirmed school year as .ics (handy for sharing with staff). */
export function yearToIcs(year: { id: string; firstDay: ISODate; lastDay: ISODate; breaks: { name: string; start: ISODate; end: ISODate }[] }): string {
  const d = (x: ISODate) => x.replace(/-/g, "");
  const ev = (name: string, s: ISODate, e: ISODate, i: number) =>
    ["BEGIN:VEVENT", `UID:${year.id}-${i}@sped-agent`, `DTSTART;VALUE=DATE:${d(s)}`, `DTEND;VALUE=DATE:${d(addDays(e, 1))}`, `SUMMARY:${name}`, "END:VEVENT"].join("\r\n");
  const events = [
    ev("First day of school", year.firstDay, year.firstDay, 0),
    ...year.breaks.map((b, i) => ev(b.name, b.start, b.end, i + 1)),
    ev("Last day of school", year.lastDay, year.lastDay, 999),
  ];
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SpEd Agent//EN", ...events, "END:VCALENDAR"].join("\r\n");
}
