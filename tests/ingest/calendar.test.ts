import { describe, expect, it } from "vitest";
import { detectSchoolYear, eventsFromText, proposeYear } from "../../src/calendar/extract";
import { eventsFromIcs, yearToIcs } from "../../src/calendar/ics";
import { SAMPLE_CAL } from "../fixtures";

describe("calendar text", () => {
  const lines = [
    "Sample Unified School District 2026-27 Instructional Calendar",
    "August 13, 2026 First Day of School",
    "Sept. 7 Labor Day Holiday",
    "Nov. 23-27 Thanksgiving Recess",
    "Winter Break: December 21, 2026 – January 1, 2027",
    "1/18/27 Martin Luther King Jr. Day",
    "March 29 - April 2 Spring Break",
    "Back to School Night September 3",
    "June 3, 2027 Last Day of School",
  ];
  it("detects the school year", () => expect(detectSchoolYear(lines.join(" "))).toBe(2026));
  it("finds dates, ranges and roles", () => {
    const ev = eventsFromText(lines, 2026);
    const find = (s: string) => ev.find((e) => e.start === s);
    expect(find("2026-08-13")?.role).toBe("first-day");
    expect(find("2026-09-07")).toMatchObject({ role: "break", end: "2026-09-07" });
    expect(find("2026-11-23")).toMatchObject({ role: "break", end: "2026-11-27" });
    expect(find("2026-12-21")).toMatchObject({ role: "break", end: "2027-01-01" });
    expect(find("2027-01-18")?.role).toBe("break");
    expect(find("2027-03-29")).toMatchObject({ role: "break", end: "2027-04-02" });
    expect(find("2026-09-03")?.role).toBe("ignore");
    expect(find("2027-06-03")?.role).toBe("last-day");
    const p = proposeYear(ev, "cal.pdf");
    expect(p.year).toMatchObject({ id: "2026-27", firstDay: "2026-08-13", lastDay: "2027-06-03" });
    expect(p.year.breaks).toHaveLength(5);
    expect(p.warnings).toEqual([]);
  });
});

describe("ics", () => {
  it("round-trips a school year", () => {
    const ics = yearToIcs(SAMPLE_CAL.years[1]);
    const p = proposeYear(eventsFromIcs(ics), "x.ics");
    expect(p.year.firstDay).toBe("2026-08-13");
    expect(p.year.lastDay).toBe("2027-06-03");
    expect(p.year.breaks.find((b) => b.name === "Winter break")).toMatchObject({ start: "2026-12-21", end: "2027-01-01" });
  });
  it("treats all-day DTEND as exclusive and unfolds lines", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261128\r\nSUMMARY:Thanksgiving\r\n  Break\r\nEND:VEVENT\r\nEND:VCALENDAR";
    expect(eventsFromIcs(ics)[0]).toMatchObject({ start: "2026-11-23", end: "2026-11-27", role: "break", name: "Thanksgiving Break" });
  });
});
