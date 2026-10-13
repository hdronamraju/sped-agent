import { describe, expect, it } from "vitest";
import {
  addSchoolDays,
  countCaliforniaDays,
  excludedSpans,
  isSchoolDay,
  mergedBreaks,
  schoolDaysBetween,
} from "../../src/rules/schoolDays";
import { addYears } from "../../src/rules/dates";
import { SAMPLE_CAL } from "../fixtures";

describe("excluded spans", () => {
  const spans = excludedSpans(SAMPLE_CAL).map((s) => [s.from, s.to, !!s.provisional]);
  it("lists summers and long vacations only", () => {
    expect(spans).toEqual([
      ["2025-12-22", "2026-01-02", false],
      ["2026-06-05", "2026-08-12", false],
      ["2026-12-21", "2027-01-01", false],
      ["2027-03-26", "2027-04-02", false],
      ["2027-06-04", "2027-08-11", false],
      ["2027-12-20", "2027-12-31", false],
      ["2028-06-02", "2028-08-13", true],
    ]);
  });
  it("merges a holiday that touches a break, across a weekend", () => {
    const merged = mergedBreaks(SAMPLE_CAL.years[1]).find((b) => b.start === "2027-03-26");
    expect(merged?.end).toBe("2027-04-02");
    const presidents = mergedBreaks(SAMPLE_CAL.years[1]).find((b) => b.start === "2027-02-12");
    expect(presidents?.end).toBe("2027-02-15");
  });
});

describe("school days", () => {
  it("knows weekends, holidays, breaks and summer", () => {
    expect(isSchoolDay(SAMPLE_CAL, "2026-10-14")).toBe(true);
    expect(isSchoolDay(SAMPLE_CAL, "2026-10-17")).toBe(false); // Saturday
    expect(isSchoolDay(SAMPLE_CAL, "2026-11-11")).toBe(false); // Veterans Day
    expect(isSchoolDay(SAMPLE_CAL, "2026-12-28")).toBe(false); // winter break
    expect(isSchoolDay(SAMPLE_CAL, "2027-07-01")).toBe(false); // summer
  });
  it("adds school days forward and back", () => {
    expect(addSchoolDays(SAMPLE_CAL, "2026-12-18", 1)).toBe("2027-01-04");
    expect(addSchoolDays(SAMPLE_CAL, "2027-01-04", -1)).toBe("2026-12-18");
    expect(addSchoolDays(SAMPLE_CAL, "2026-11-20", 2)).toBe("2026-12-01");
  });
  it("counts school days between dates", () => {
    expect(schoolDaysBetween(SAMPLE_CAL, "2026-10-05", "2026-10-09")).toBe(4);
    expect(schoolDaysBetween(SAMPLE_CAL, "2026-10-09", "2026-10-05")).toBe(-4);
    expect(schoolDaysBetween(SAMPLE_CAL, "2026-10-05", "2026-10-05")).toBe(0);
  });
  it("counts California days with no breaks", () => {
    expect(countCaliforniaDays(SAMPLE_CAL, "2026-10-05", 15).end).toBe("2026-10-20");
  });
  it("leap years", () => {
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2027-03-01", 1)).toBe("2028-03-01");
  });
});
