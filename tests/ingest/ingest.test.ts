import { describe, expect, it } from "vitest";
import { parseDate } from "../../src/ingest/dates";
import { applyAnswer, guessField, proposeMapping } from "../../src/ingest/mapColumns";
import { parseCsvText } from "../../src/ingest/parseFile";
import { buildStudents, mergeStudents } from "../../src/ingest/buildStudents";

describe("parseDate", () => {
  it.each([
    ["2026-10-09", "2026-10-09"],
    ["10/9/2026", "2026-10-09"],
    ["10/09/26", "2026-10-09"],
    ["25/12/2026", "2026-12-25"],
    ["Oct 9, 2026", "2026-10-09"],
    ["October 9 2026", "2026-10-09"],
    ["9-Oct-26", "2026-10-09"],
    ["20261009", "2026-10-09"],
    ["46304", "2026-10-09"],
    [46304, "2026-10-09"],
    ["2026-10-09T00:00:00", "2026-10-09"],
  ])("%s → %s", (input, out) => expect(parseDate(input)).toBe(out));
  it.each(["", "n/a", "TBD", "13/13/2026", "2026-02-30"])("rejects %s", (v) => expect(parseDate(v)).toBeNull());
});

describe("column mapping", () => {
  it.each([
    ["Student ID", "id"],
    ["SSID", "id"],
    ["Stu #", "id"],
    ["Last Annual IEP", "lastAnnual"],
    ["Annual Plan Review Due", "seisAnnualDue"],
    ["Next Tri Due", "seisTriennialDue"],
    ["Last Triennial", "lastTriennial"],
    ["Referral Date", "referral"],
    ["AP Signed", "consent"],
    ["Consent Received", "consent"],
    ["Assessment Plan Sent", "planSent"],
    ["Parent Email", "parentEmail"],
    ["Home Language", "parentLanguage"],
    ["Case Manager", "caseManager"],
    ["School of Attendance", "school"],
    ["Parent Request Date", "parentRequest"],
  ])("%s → %s", (h, f) => expect(guessField(h)).toBe(f));

  const csv = `Caseload report,,,,\nGenerated 10/1/2026,,,,\nStu #,Last Annual IEP,Date 2,Mystery,Notes\nA1,10/15/2025,11/1/2026,x,hi\nA2,bad date,11/3/2026,y,\n,1/1/2026,,,\nA3,2025-12-01,,z,`;
  const file = { fileName: "seis.csv", sheets: [parseCsvText(csv, "seis.csv")] };

  it("finds the header row below report titles and asks about unknown date columns", () => {
    const m = proposeMapping(file);
    expect(m.sheets[0].headerRow).toBe(2);
    expect(m.questions).toHaveLength(1);
    expect(m.questions[0].header).toBe("Date 2");
    expect(m.questions.length).toBeLessThanOrEqual(5);
  });

  it("builds students, listing every unreadable row with a reason", () => {
    let m = proposeMapping(file);
    m = applyAnswer(m, m.questions[0], "referral");
    const r = buildStudents(file, m, { kind: "seis", uploadId: "u1" });
    expect(r.students.map((s) => s.id)).toEqual(["A1", "A2", "A3"]);
    expect(r.students[0].dates).toEqual({ lastAnnual: "2025-10-15", referral: "2026-11-01" });
    expect(r.errors.map((e) => e.row)).toEqual([5, 6]);
    expect(r.errors[0].reason).toMatch(/bad date/);
    expect(r.errors[1].reason).toMatch(/No student ID/);
  });

  it("asks for the ID column when none is recognized, and works with only IDs and dates", () => {
    const f = { fileName: "t.csv", sheets: [parseCsvText("Kid,Referral\n123,10/1/2026\n456,10/2/2026", "t")] };
    let m = proposeMapping(f);
    const q = m.questions.find((x) => x.kind === "id-column")!;
    expect(q).toBeTruthy();
    m = applyAnswer(m, q, "0");
    const r = buildStudents(f, m, { kind: "tracker", uploadId: "u2" });
    expect(r.students).toHaveLength(2);
    expect(r.students[0].onTracker).toBe(true);
  });

  it("privacy-light mode drops names and contact details", () => {
    const f = { fileName: "t.csv", sheets: [parseCsvText("Student ID,Student Name,Parent Email,Home Language\n1,Leo M,mom@x.org,Spanish", "t")] };
    const r = buildStudents(f, proposeMapping(f), { kind: "seis", uploadId: "u", privacyLight: true });
    expect(r.students[0].name).toBeUndefined();
    expect(r.students[0].parentEmail).toBeUndefined();
    expect(r.students[0].parentLanguage).toBe("Spanish");
  });

  it("merges uploads by student ID", () => {
    const a = buildStudents({ fileName: "a", sheets: [parseCsvText("Student ID,Last Annual\n1,1/1/2026", "a")] }, proposeMapping({ fileName: "a", sheets: [parseCsvText("Student ID,Last Annual\n1,1/1/2026", "a")] }), { kind: "seis", uploadId: "a" }).students;
    const bFile = { fileName: "b", sheets: [parseCsvText("Student ID,Referral\n1,9/1/2026\n2,9/2/2026", "b")] };
    const b = buildStudents(bFile, proposeMapping(bFile), { kind: "tracker", uploadId: "b" }).students;
    const m = mergeStudents(a, b);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ inSeis: true, onTracker: true, dates: { lastAnnual: "2026-01-01", referral: "2026-09-01" } });
  });
});
