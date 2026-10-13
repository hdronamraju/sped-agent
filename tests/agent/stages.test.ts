import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { studentStage } from "../../src/agent/stages";
import { atRiskList, computeAll } from "../../src/agent/queue";
import { DEFAULT_SETTINGS, type Meeting } from "../../src/agent/model";
import { computeStudentClocks } from "../../src/rules/engine";
import { parseFile } from "../../src/ingest/parseFile";
import { applyAnswer, proposeMapping } from "../../src/ingest/mapColumns";
import { buildStudents, mergeStudents } from "../../src/ingest/buildStudents";
import { eventsFromIcs } from "../../src/calendar/ics";
import { proposeYear } from "../../src/calendar/extract";
import type { Student } from "../../src/types";
import { SAMPLE_CAL, student } from "../fixtures";

const TODAY = "2026-10-10";
const stageFor = (s: Student, meetings: Meeting[] = []) =>
  studentStage(s, computeStudentClocks(s, SAMPLE_CAL, { today: TODAY }), meetings, TODAY, { trackerLoaded: true });

const meeting = (studentId: string, status: Meeting["status"]): Meeting => ({
  id: "m1", studentId, clockId: "eval-meeting", type: "initial", deadline: "2026-11-01", latestAllowed: "2026-10-23",
  attendees: [], options: [], status, messages: [], location: "", parentLanguage: "English", createdAt: "2026-10-08T17:00:00Z", parentReplies: [],
});

describe("studentStage", () => {
  it("referred: referral only", () => {
    const r = stageFor(student({ referral: "2026-10-05" }));
    expect(r).toMatchObject({ stage: "referred", since: "2026-10-05", daysInStage: 5 });
    expect(r.next?.clockId).toBe("assessment-plan");
  });
  it("plan with family: plan sent, no consent", () => {
    const r = stageFor(student({ referral: "2026-09-28", planSent: "2026-10-06" }));
    expect(r).toMatchObject({ stage: "plan", since: "2026-10-06", daysInStage: 4 });
    expect(r.next?.clockId).toBe("parent-decision");
  });
  it("assessing: consent signed, no meeting yet", () => {
    const r = stageFor(student({ referral: "2026-08-20", planSent: "2026-08-27", consent: "2026-09-02" }));
    expect(r).toMatchObject({ stage: "assessing", since: "2026-09-02", daysInStage: 38 });
    expect(r.next?.clockId).toBe("eval-meeting");
  });
  it("an active meeting wins over assessing", () => {
    const s = student({ consent: "2026-09-02" }, { id: "S9" });
    expect(stageFor(s, [meeting("S9", "awaiting-parent")])).toMatchObject({ stage: "meeting", since: "2026-10-08" });
    expect(stageFor(s, [meeting("S9", "held")]).stage).toBe("assessing");
    expect(stageFor(s, [meeting("S9", "cancelled")]).stage).toBe("assessing");
  });
  it("active IEP once the evaluation meeting is held", () => {
    const r = stageFor(student({ referral: "2026-04-14", planSent: "2026-04-20", consent: "2026-04-28", evalMeetingHeld: "2026-06-02" }));
    expect(r).toMatchObject({ stage: "active", since: "2026-06-02" });
  });
  it("review due: annual within 60 days, since the window opened", () => {
    const r = stageFor(student({ lastAnnual: "2025-11-01" })); // act by Oct 30, 2026
    expect(r.stage).toBe("review");
    expect(r.since).toBe("2026-08-31");
    expect(r.next?.clockId).toBe("annual");
  });
  it("review due: overdue annual is flagged", () => {
    const r = stageFor(student({ lastAnnual: "2025-09-01" }));
    expect(r.stage).toBe("review");
    expect(r.flags.overdue).toBe(true);
  });
  it("review due: open parent request counts from the request", () => {
    const r = stageFor(student({ lastAnnual: "2026-03-01", parentRequest: "2026-09-30" }));
    expect(r).toMatchObject({ stage: "review", since: "2026-09-30" });
  });
  it("triennial re-evaluation in progress goes back to assessing", () => {
    const r = stageFor(student({ lastAnnual: "2026-01-10", lastTriennial: "2024-01-10", planSent: "2026-09-01", consent: "2026-09-10" }));
    expect(r.stage).toBe("assessing");
  });
  it("needs info when there are no dates", () => {
    expect(stageFor(student({})).stage).toBe("info");
  });
  it("flags interpreter, missing email and not on tracker", () => {
    const r = stageFor(student({ lastAnnual: "2025-11-01" }, { parentLanguage: "Spanish", onTracker: false, inSeis: true }));
    expect(r.flags).toMatchObject({ interpreter: true, noParentEmail: true, notOnTracker: true, overdue: false });
  });
});

describe("sample district stages", async () => {
  const load = (f: string) => {
    const b = readFileSync(new URL(`../../public/samples/${f}`, import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const seisFile = await parseFile("seis-export.csv", load("seis-export.csv"));
  const trackerFile = await parseFile("my-tracker.xlsx", load("my-tracker.xlsx"));
  let tm = proposeMapping(trackerFile);
  for (const q of [...tm.questions]) tm = applyAnswer(tm, q, q.header === "Mtg Held" ? (q.sheetName === "Parent requests" ? "parentRequestMeetingHeld" : "evalMeetingHeld") : "ignore");
  const students = mergeStudents(
    buildStudents(seisFile, proposeMapping(seisFile), { kind: "seis", uploadId: "s" }).students,
    buildStudents(trackerFile, tm, { kind: "tracker", uploadId: "t" }).students,
  );
  const cal = {
    districtName: "Sample Unified",
    years: ["calendar-2026-27.ics", "calendar-2027-28.ics"].map((f) => proposeYear(eventsFromIcs(new TextDecoder().decode(load(f))), f).year),
  };
  const snap = computeAll(students, cal, TODAY, DEFAULT_SETTINGS);
  const trackerLoaded = atRiskList(students, snap).trackerLoaded;
  const stage = (id: string) => studentStage(students.find((s) => s.id === id)!, snap.byStudent.get(id)!, [], TODAY, { trackerLoaded }).stage;

  it("places the story students where a coordinator would", () => {
    expect(stage("1001")).toBe("plan"); // Leo: plan sent Oct 6
    expect(stage("1004")).toBe("referred"); // Ava: plan never sent
    expect(stage("1002")).toBe("assessing"); // Sofia: consent Sep 2
    expect(stage("1003")).toBe("review"); // Ethan: annual overdue
    expect(stage("1014")).toBe("active"); // Chloe: found eligible in June
    expect(stage("1005")).toBe("review"); // Mateo: parent request open
  });
  it("puts every student somewhere", () => {
    const counts: Record<string, number> = {};
    for (const s of students) counts[stage(s.id)] = (counts[stage(s.id)] ?? 0) + 1;
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(students.length);
  });
});
