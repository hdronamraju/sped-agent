import type { DistrictCalendar } from "../src/rules/schoolDays";
import type { Student } from "../src/types";

/**
 * "Sample Unified" calendars used by the hand-calculated cases.
 *
 * Spans a California clock skips with this calendar:
 *   2025-12-22 – 2026-01-02  winter break 25-26 (10 school days)
 *   2026-06-05 – 2026-08-12  summer 2026
 *   2026-12-21 – 2027-01-01  winter break 26-27 (10 school days)
 *   2027-03-26 – 2027-04-02  Cesar Chavez Day + spring break (6 school days, merged)
 *   2027-06-04 – 2027-08-11  summer 2027
 *   2027-12-20 – 2027-12-31  winter break 27-28 (10 school days)
 *   2028-06-02 – 2028-08-13  summer 2028 (provisional: 2028-29 not loaded)
 * Counted (5 school days or fewer): Thanksgiving weeks, spring break 25-26 and 27-28,
 * Lincoln Day + Presidents' Day 2027 (merged across a weekend, 2 school days).
 */
export const SAMPLE_CAL: DistrictCalendar = {
  districtName: "Sample Unified",
  years: [
    {
      id: "2025-26",
      firstDay: "2025-08-13",
      lastDay: "2026-06-04",
      breaks: [
        { name: "Labor Day", start: "2025-09-01", end: "2025-09-01" },
        { name: "Thanksgiving break", start: "2025-11-24", end: "2025-11-28" },
        { name: "Winter break", start: "2025-12-22", end: "2026-01-02" },
        { name: "MLK Day", start: "2026-01-19", end: "2026-01-19" },
        { name: "Spring break", start: "2026-03-30", end: "2026-04-03" },
        { name: "Memorial Day", start: "2026-05-25", end: "2026-05-25" },
      ],
    },
    {
      id: "2026-27",
      firstDay: "2026-08-13",
      lastDay: "2027-06-03",
      breaks: [
        { name: "Labor Day", start: "2026-09-07", end: "2026-09-07" },
        { name: "Veterans Day", start: "2026-11-11", end: "2026-11-11" },
        { name: "Thanksgiving break", start: "2026-11-23", end: "2026-11-27" },
        { name: "Winter break", start: "2026-12-21", end: "2027-01-01" },
        { name: "MLK Day", start: "2027-01-18", end: "2027-01-18" },
        { name: "Lincoln Day", start: "2027-02-12", end: "2027-02-12" },
        { name: "Presidents' Day", start: "2027-02-15", end: "2027-02-15" },
        { name: "Cesar Chavez Day", start: "2027-03-26", end: "2027-03-26" },
        { name: "Spring break", start: "2027-03-29", end: "2027-04-02" },
        { name: "Memorial Day", start: "2027-05-31", end: "2027-05-31" },
      ],
    },
    {
      id: "2027-28",
      firstDay: "2027-08-12",
      lastDay: "2028-06-01",
      breaks: [
        { name: "Labor Day", start: "2027-09-06", end: "2027-09-06" },
        { name: "Veterans Day", start: "2027-11-11", end: "2027-11-11" },
        { name: "Thanksgiving break", start: "2027-11-22", end: "2027-11-26" },
        { name: "Winter break", start: "2027-12-20", end: "2027-12-31" },
        { name: "MLK Day", start: "2028-01-17", end: "2028-01-17" },
        { name: "Presidents' Day", start: "2028-02-21", end: "2028-02-21" },
        { name: "Spring break", start: "2028-03-27", end: "2028-03-31" },
        { name: "Memorial Day", start: "2028-05-29", end: "2028-05-29" },
      ],
    },
  ],
};

export function student(dates: Student["dates"], extra: Partial<Student> = {}): Student {
  return {
    id: extra.id ?? "S1",
    dates,
    sources: [],
    onTracker: true,
    inSeis: true,
    exceptions: [],
    ...extra,
  };
}
