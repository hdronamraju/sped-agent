import { describe, expect, it } from "vitest";
import { proposeTimes } from "../../src/agent/proposeTimes";
import { parseReply } from "../../src/agent/replyParser";
import { requiredAttendees } from "../../src/agent/attendees";
import { checkNotice, draftNotice, draftParentOptions } from "../../src/agent/notices";
import { atRiskList, buildQueue, computeAll } from "../../src/agent/queue";
import { DEFAULT_SETTINGS, type Meeting, type StaffMember } from "../../src/agent/model";
import { laToUtc } from "../../src/agent/time";
import { appendEntry, verifyChain, type AuditEntry } from "../../src/audit/log";
import { SAMPLE_CAL, student } from "../fixtures";

const settings = DEFAULT_SETTINGS;

describe("laToUtc", () => {
  it("handles PST and PDT", () => {
    expect(new Date(laToUtc("2027-01-13", "15:30")).toISOString()).toBe("2027-01-13T23:30:00.000Z");
    expect(new Date(laToUtc("2026-10-14", "08:00")).toISOString()).toBe("2026-10-14T15:00:00.000Z");
  });
});

describe("proposeTimes", () => {
  it("finds three times on different days, all before the buffer", () => {
    const r = proposeTimes({ cal: SAMPLE_CAL, today: "2026-12-10", deadline: "2027-01-20", busy: {}, settings });
    expect(r.slots).toHaveLength(3);
    expect(new Set(r.slots.map((s) => s.date)).size).toBe(3);
    expect(r.windowStart).toBe("2026-12-15");
    expect(r.latestAllowed).toBe("2027-01-12"); // 5 school days before Jan 20 (MLK Jan 18 skipped)
    for (const s of r.slots) expect(s.date <= r.latestAllowed).toBe(true);
    expect(r.slots[0]).toEqual({ date: "2026-12-15", start: "15:00", end: "16:00" });
  });
  it("skips times when someone is busy", () => {
    const busy = { "psych@x.org": [{ start: laToUtc("2026-12-15", "07:00"), end: laToUtc("2026-12-15", "17:00") }] };
    const r = proposeTimes({ cal: SAMPLE_CAL, today: "2026-12-10", deadline: "2027-01-20", busy, settings });
    expect(r.slots[0].date).toBe("2026-12-16");
  });
  it("never proposes past the deadline; escalates instead", () => {
    const allBusy = { "a@x.org": [{ start: 0, end: laToUtc("2030-01-01", "00:00") }] };
    const r = proposeTimes({ cal: SAMPLE_CAL, today: "2026-12-10", deadline: "2027-01-20", busy: allBusy, settings });
    expect(r.slots).toEqual([]);
    expect(r.escalate).toMatch(/No time/);
  });
  it("uses the buffer only when it must", () => {
    const r = proposeTimes({ cal: SAMPLE_CAL, today: "2027-01-08", deadline: "2027-01-20", busy: {}, settings });
    expect(r.insideBuffer).toBe(true);
    expect(r.slots.every((s) => s.date <= "2027-01-20")).toBe(true);
  });
});

describe("parseReply", () => {
  const opts = [
    { date: "2027-01-12", start: "15:00", end: "16:00" }, // Tue
    { date: "2027-01-13", start: "15:00", end: "16:00" }, // Wed
    { date: "2027-01-14", start: "08:00", end: "09:00" }, // Thu
  ];
  it.each([
    ["2", 1],
    ["La opción 2 por favor", 1],
    ["The second one works", 1],
    ["el miércoles", 1],
    ["3\n\nOn Mon, Dec 14 Maria wrote:\n> 1) ...\n> 2) ...", 2],
    ["Primera", 0],
  ])("%s → %s", (body, idx) => expect(parseReply(body, opts).choice).toBe(idx));
  it("detects 'none'", () => expect(parseReply("Ninguna, trabajo esos días", opts).none).toBe(true));
  it("flags ambiguity", () => expect(parseReply("1 or 2 is fine", opts).confidence).toBe("low"));
});

const staff: StaffMember[] = [
  { id: "1", name: "Dr. Patel", email: "patel@x.org", role: "school-psychologist" },
  { id: "2", name: "Ms. Rivera", email: "rivera@x.org", role: "sped-teacher", school: "Lincoln" },
  { id: "3", name: "Mr. Chen", email: "chen@x.org", role: "gen-ed-teacher", school: "Lincoln" },
  { id: "4", name: "Principal Ortiz", email: "ortiz@x.org", role: "administrator", school: "Lincoln" },
  { id: "5", name: "Ana Gómez", email: "gomez@x.org", role: "interpreter", languages: ["Spanish"] },
];
const leo = student({ consent: "2026-11-09" }, { id: "1001", name: "Leo Martinez", school: "Lincoln", parentName: "Rosa Martinez", parentEmail: "rosa@example.com", parentLanguage: "Spanish", evalType: "initial" });

describe("attendees and notices", () => {
  const attendees = requiredAttendees("initial", leo, staff);
  it("lists required roles and flags an interpreter", () => {
    expect(attendees.map((a) => a.role)).toEqual(["parent", "administrator", "gen-ed-teacher", "sped-teacher", "school-psychologist", "interpreter"]);
    expect(attendees.find((a) => a.role === "interpreter")?.name).toBe("Ana Gómez");
  });
  const m: Meeting = {
    id: "m", studentId: "1001", clockId: "eval-meeting", type: "initial", deadline: "2027-01-20", latestAllowed: "2027-01-12",
    attendees, options: [{ date: "2027-01-12", start: "15:00", end: "16:00" }], chosen: { date: "2027-01-12", start: "15:00", end: "16:00" },
    status: "notice-draft", messages: [], location: "Lincoln Elementary, Room 4", parentLanguage: "Spanish", createdAt: "", parentReplies: [],
  };
  const c = { name: "Maria Lopez", email: "maria@x.org", district: "Sample Unified" };
  it("drafts the parent message in Spanish", () => {
    const d = draftParentOptions(m, leo, c);
    expect(d.language).toBe("es");
    expect(d.body).toContain("martes 12 de enero de 2027");
    expect(d.body).toMatch(/1, 2 o 3/);
  });
  it("passes the required-content check", () => {
    const d = draftNotice(m, leo, c);
    const checks = checkNotice(m, leo, d.body, d.language, "2027-01-20");
    expect(checks.filter((x) => !x.ok)).toEqual([]);
  });
  it("fails the check when the meeting is past the deadline or in the wrong language", () => {
    const d = draftNotice(m, leo, c);
    const late = checkNotice(m, leo, d.body, d.language, "2027-01-11");
    expect(late.find((x) => x.id === "deadline")?.ok).toBe(false);
    const english = checkNotice(m, leo, d.body, "en", "2027-01-20");
    expect(english.find((x) => x.id === "language")?.ok).toBe(false);
  });
});

describe("queue and at-risk", () => {
  const students = [
    student({ lastAnnual: "2025-09-01" }, { id: "OVER", onTracker: false }),
    student({ lastAnnual: "2025-11-01" }, { id: "SOON", onTracker: false }),
    student({ referral: "2026-10-05" }, { id: "REF", onTracker: true }),
    student({ lastAnnual: "2026-03-01" }, { id: "LATER", onTracker: false }),
  ];
  const snap = computeAll(students, SAMPLE_CAL, "2026-10-10", settings);
  it("groups overdue, due soon and not on tracker", () => {
    const r = atRiskList(students, snap);
    expect(r.overdue.map((x) => x.studentId)).toEqual(["OVER"]);
    expect(r.dueSoon.map((x) => x.studentId).sort()).toEqual(["REF", "SOON"]);
    expect(r.notOnTracker.map((x) => x.student.id).sort()).toEqual(["OVER", "SOON"]);
  });
  it("sorts the queue by days remaining and respects done/snooze", () => {
    const q = buildQueue({ students, snapshot: snap, meetings: [], marks: {}, cal: SAMPLE_CAL, today: "2026-10-10", settings });
    expect(q.map((i) => i.studentId)).toEqual(["OVER", "REF", "SOON"]);
    const key = q[0].key;
    const q2 = buildQueue({ students, snapshot: snap, meetings: [], marks: { [key]: { status: "snoozed", until: "2026-10-12", reason: "parent on vacation", by: "m", at: "" } }, cal: SAMPLE_CAL, today: "2026-10-10", settings });
    expect(q2.map((i) => i.studentId)).toEqual(["REF", "SOON"]);
  });
});

describe("audit chain", () => {
  it("detects tampering", async () => {
    let log: AuditEntry[] = [];
    for (const s of ["a", "b", "c"]) log = [...log, await appendEntry(log, { user: "m", action: "upload", summary: s })];
    expect(await verifyChain(log)).toEqual({ ok: true });
    log[1] = { ...log[1], summary: "edited" };
    expect(await verifyChain(log)).toEqual({ ok: false, brokenAt: 2 });
  });
});
