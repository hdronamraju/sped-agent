import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFile } from "../../src/ingest/parseFile";
import { applyAnswer, proposeMapping } from "../../src/ingest/mapColumns";
import { buildStudents, mergeStudents } from "../../src/ingest/buildStudents";
import { eventsFromIcs } from "../../src/calendar/ics";
import { proposeYear } from "../../src/calendar/extract";
import { atRiskList, computeAll } from "../../src/agent/queue";
import { DEFAULT_SETTINGS } from "../../src/agent/model";

const load = (f: string) => {
  const b = readFileSync(new URL(`../../public/samples/${f}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("sample files end to end", async () => {
  const seisFile = await parseFile("seis-export.csv", load("seis-export.csv"));
  const seisMap = proposeMapping(seisFile);
  const trackerFile = await parseFile("my-tracker.xlsx", load("my-tracker.xlsx"));
  let trackerMap = proposeMapping(trackerFile);

  it("maps the SEIS export with no questions", () => {
    expect(seisMap.questions).toEqual([]);
    const fields = seisMap.sheets[0].columns.map((c) => c.field);
    expect(fields).toEqual(["id", "lastName", "firstName", "school", "grade", "caseManager", "disability", "lastAnnual", "seisAnnualDue", "lastTriennial", "seisTriennialDue", "parentName", "parentEmail", "parentLanguage"]);
  });

  it("reads every tracker tab, skipping the read-me, with at most 5 questions", () => {
    expect(trackerMap.sheets.find((s) => s.sheetName === "Read me")?.skipped).toBeTruthy();
    expect(trackerMap.questions.length).toBeGreaterThan(0);
    expect(trackerMap.questions.length).toBeLessThanOrEqual(5);
    for (const q of [...trackerMap.questions]) {
      const answer = q.header === "Mtg Held" ? (q.sheetName === "Parent requests" ? "parentRequestMeetingHeld" : "evalMeetingHeld") : "ignore";
      trackerMap = applyAnswer(trackerMap, q, answer);
    }
  });

  it("builds a roster and finds who's at risk", () => {
    const seis = buildStudents(seisFile, seisMap, { kind: "seis", uploadId: "s" });
    const tracker = buildStudents(trackerFile, trackerMap, { kind: "tracker", uploadId: "t" });
    expect(seis.errors).toEqual([]);
    expect(tracker.errors.map((e) => e.reason)).toEqual([expect.stringMatching(/No student ID/), expect.stringMatching(/TBD/)]);
    const students = mergeStudents(seis.students, tracker.students);
    const leo = students.find((s) => s.id === "1001")!;
    expect(leo).toMatchObject({ name: "Leo Martinez", parentLanguage: "Spanish", dates: { referral: "2026-09-28", planSent: "2026-10-06" } });

    const cal = {
      districtName: "Sample Unified",
      years: [proposeYear(eventsFromIcs(new TextDecoder().decode(load("calendar-2026-27.ics"))), "ics").year, proposeYear(eventsFromIcs(new TextDecoder().decode(load("calendar-2027-28.ics"))), "ics").year],
    };
    expect(cal.years[0].breaks).toHaveLength(10);
    const snap = computeAll(students, cal, "2026-10-10", DEFAULT_SETTINGS);
    const risk = atRiskList(students, snap);
    const overdueIds = risk.overdue.map((r) => r.studentId);
    expect(overdueIds).toContain("1003"); // annual overdue, SEIS only
    expect(overdueIds).toContain("1004"); // assessment plan never sent
    expect(risk.dueSoon.map((r) => r.studentId)).toEqual(expect.arrayContaining(["1002", "1005", "1006"]));
    expect(risk.notOnTracker.map((x) => x.student.id)).toContain("1003");
  });
});
