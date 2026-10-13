import { describe, expect, it } from "vitest";
import { RULES_BY_ID, type ClockId } from "../../src/rules/ca-rules";
import { computeClock } from "../../src/rules/engine";
import type { ClockException, Student } from "../../src/types";
import { SAMPLE_CAL, student } from "../fixtures";

/**
 * Hand-calculated cases against SAMPLE_CAL (see tests/fixtures.ts for the spans).
 * Each "why" is the hand working; the engine must match it exactly.
 */
interface Case {
  n: number;
  clock: ClockId;
  dates: Student["dates"];
  due: string;
  actionBy?: string; // defaults to due
  startBy?: string;
  status?: string;
  today?: string;
  exceptions?: Partial<ClockException>[];
  eoy?: boolean;
  provisional?: boolean;
  why: string;
}

const CASES: Case[] = [
  // ── Assessment plan: 15 days, EC 56321(a) ─────────────────────────────
  { n: 1, clock: "assessment-plan", dates: { referral: "2026-10-05" }, due: "2026-10-20", why: "No breaks: Oct 5 + 15." },
  { n: 2, clock: "assessment-plan", dates: { referral: "2026-11-16" }, due: "2026-12-01", why: "Thanksgiving is exactly 5 school days, so it counts." },
  { n: 3, clock: "assessment-plan", dates: { referral: "2026-12-10" }, due: "2027-01-06", why: "10 days to Dec 20, skip winter break (12), 5 more → Jan 6." },
  { n: 4, clock: "assessment-plan", dates: { referral: "2026-12-18" }, due: "2027-01-14", why: "2 days to Dec 20, skip 12, 13 more → Jan 14." },
  { n: 5, clock: "assessment-plan", dates: { referral: "2026-12-21" }, due: "2027-01-16", actionBy: "2027-01-15", why: "Received during break: count starts Jan 2 → Sat Jan 16; act by Fri." },
  { n: 6, clock: "assessment-plan", dates: { referral: "2027-03-20" }, due: "2027-04-12", why: "5 days to Mar 25, skip merged 6-school-day spring break (8), 10 more → Apr 12." },
  { n: 7, clock: "assessment-plan", dates: { referral: "2026-11-20" }, due: "2026-12-05", actionBy: "2026-12-04", why: "Lands Saturday; act by Friday." },
  { n: 8, clock: "assessment-plan", dates: { referral: "2027-05-25" }, due: "2027-08-21", actionBy: "2027-08-20", eoy: true, why: "9 days before Jun 3: day 10 of next year (Aug 12 = day 1) → Sat Aug 21." },
  { n: 9, clock: "assessment-plan", dates: { referral: "2027-05-24" }, due: "2027-08-21", actionBy: "2027-08-20", eoy: true, why: "Exactly 10 days before year end: rule applies." },
  { n: 10, clock: "assessment-plan", dates: { referral: "2027-05-21" }, due: "2027-08-13", why: "13 days before year end: normal count, 13 days to Jun 3, skip summer, 2 more → Aug 13." },
  { n: 11, clock: "assessment-plan", dates: { referral: "2027-06-03" }, due: "2027-08-21", actionBy: "2027-08-20", eoy: true, why: "Referral on the last day of school." },
  { n: 12, clock: "assessment-plan", dates: { referral: "2027-07-10" }, due: "2027-08-26", why: "Summer referral: count starts Aug 12 (day 1) → Aug 26." },
  { n: 13, clock: "assessment-plan", dates: { referral: "2026-05-28" }, due: "2026-08-22", actionBy: "2026-08-21", eoy: true, why: "7 days before Jun 4, 2026: day 10 from Aug 13 → Sat Aug 22." },
  { n: 14, clock: "assessment-plan", dates: { referral: "2028-05-25" }, due: "2028-08-23", eoy: true, provisional: true, why: "Next year not loaded: first day estimated Mon Aug 14, 2028 → day 10 Aug 23." },
  { n: 15, clock: "assessment-plan", dates: { referral: "2027-01-29" }, due: "2027-02-13", actionBy: "2027-02-11", why: "Sat Feb 13; Fri Feb 12 is Lincoln Day, so act by Thu Feb 11." },
  { n: 16, clock: "assessment-plan", dates: { referral: "2026-08-13" }, due: "2026-08-28", why: "First day of school + 15." },
  { n: 17, clock: "assessment-plan", dates: { referral: "2026-10-27" }, due: "2026-11-11", actionBy: "2026-11-10", why: "Lands on Veterans Day; act by Nov 10." },
  { n: 18, clock: "assessment-plan", dates: { referral: "2026-10-05", planSent: "2026-10-15" }, due: "2026-10-20", status: "met", why: "Plan sent on time." },
  { n: 19, clock: "assessment-plan", dates: { referral: "2026-10-05", planSent: "2026-10-22" }, due: "2026-10-20", status: "met-late", why: "Plan sent 2 days late." },
  { n: 20, clock: "assessment-plan", dates: { referral: "2026-09-01" }, due: "2026-09-16", status: "overdue", why: "No plan sent and due date passed." },

  // ── Parent decision: at least 15 calendar days, EC 56321(c)(4) ─────────
  { n: 21, clock: "parent-decision", dates: { planSent: "2026-10-20" }, due: "2026-11-04", status: "waiting", why: "Oct 20 + 15 calendar days; still within the period." },
  { n: 22, clock: "parent-decision", dates: { planSent: "2026-12-15" }, due: "2026-12-30", why: "Calendar days: winter break is not skipped." },
  { n: 23, clock: "parent-decision", dates: { planSent: "2026-12-15", consent: "2026-12-20" }, due: "2026-12-30", status: "met", why: "Signed within the period." },
  { n: 24, clock: "parent-decision", dates: { planSent: "2026-09-21" }, due: "2026-10-06", status: "follow-up", why: "Period over, no signature: follow up." },

  // ── Initial / triennial IEP: 60 days, EC 56344(a) ─────────────────────
  { n: 25, clock: "eval-meeting", dates: { consent: "2026-11-09" }, due: "2027-01-20", why: "Leo: Nov 9 + 60 + 12 winter-break days → Jan 20." },
  { n: 26, clock: "eval-meeting", dates: { consent: "2026-09-01" }, due: "2026-10-31", actionBy: "2026-10-30", why: "No breaks; Sat → Fri." },
  { n: 27, clock: "eval-meeting", dates: { consent: "2026-10-15" }, due: "2026-12-14", why: "Thanksgiving counts." },
  { n: 28, clock: "eval-meeting", dates: { consent: "2026-10-30" }, due: "2027-01-10", actionBy: "2027-01-08", why: "51 days to Dec 20, skip 12, 9 more → Sun Jan 10; act by Fri Jan 8." },
  { n: 29, clock: "eval-meeting", dates: { consent: "2027-02-01" }, due: "2027-04-10", actionBy: "2027-04-09", why: "52 days to Mar 25, skip 8, 8 more → Sat Apr 10." },
  { n: 30, clock: "eval-meeting", dates: { consent: "2027-04-20" }, due: "2027-08-27", why: "44 days to Jun 3, skip summer, 16 more from Aug 12 → Aug 27. No referral date, so no year-end rule." },
  { n: 31, clock: "eval-meeting", dates: { referral: "2027-04-10", consent: "2027-04-20" }, due: "2027-08-27", why: "Referral 54 days before year end: normal count." },
  { n: 32, clock: "eval-meeting", dates: { referral: "2027-05-10", consent: "2027-05-14" }, due: "2027-09-10", eoy: true, why: "Referral 24 days before year end. Normal → Sep 20; day 30 of next year → Sep 10, earlier." },
  { n: 33, clock: "eval-meeting", dates: { referral: "2027-05-04", consent: "2027-05-05" }, due: "2027-09-10", eoy: true, why: "Exactly 30 days: normal → Sep 11, year-end Sep 10 is earlier." },
  { n: 34, clock: "eval-meeting", dates: { referral: "2027-05-03", consent: "2027-05-05" }, due: "2027-09-11", actionBy: "2027-09-10", why: "31 days: year-end rule doesn't apply. Sat → Fri." },
  { n: 35, clock: "eval-meeting", dates: { referral: "2027-05-20", consent: "2027-08-20" }, due: "2027-10-19", why: "Consent after next year started: year-end rule doesn't apply." },
  { n: 36, clock: "eval-meeting", dates: { consent: "2026-06-01" }, due: "2026-10-08", why: "3 days to Jun 4, skip summer, 57 more from Aug 13 → Oct 8." },
  { n: 37, clock: "eval-meeting", dates: { consent: "2025-12-01" }, due: "2026-02-11", why: "Skip 25-26 winter break (12) → Feb 11." },
  { n: 38, clock: "eval-meeting", dates: { consent: "2026-11-09", evalMeetingHeld: "2027-01-13" }, due: "2027-01-20", status: "met", why: "Held Jan 13, a week early." },
  { n: 39, clock: "eval-meeting", dates: { consent: "2026-11-09", evalMeetingHeld: "2027-01-25" }, due: "2027-01-20", status: "met-late", why: "Held 5 days late." },
  { n: 40, clock: "eval-meeting", dates: { consent: "2026-11-09" }, exceptions: [{ kind: "parent-extension", agreedDate: "2027-02-05" }], due: "2027-02-05", why: "Parent's written extension." },
  { n: 41, clock: "eval-meeting", dates: { consent: "2026-11-09" }, exceptions: [{ kind: "parent-not-producing" }], due: "2027-01-20", status: "exception", why: "Parent repeatedly did not produce the child." },
  { n: 42, clock: "eval-meeting", dates: { consent: "2026-11-09" }, exceptions: [{ kind: "transfer-agreed-date", agreedDate: "2027-03-01" }], due: "2027-03-01", why: "Moved mid-assessment; agreed date." },
  { n: 43, clock: "eval-meeting", dates: { consent: "2027-12-01" }, due: "2028-02-11", why: "Skip 27-28 winter break (12) → Feb 11, 2028." },

  // ── Parent-requested meeting: 30 days, EC 56043(l) ────────────────────
  { n: 44, clock: "parent-request-meeting", dates: { parentRequest: "2026-10-01" }, due: "2026-10-31", actionBy: "2026-10-30", why: "Sat → Fri." },
  { n: 45, clock: "parent-request-meeting", dates: { parentRequest: "2026-12-01" }, due: "2027-01-12", why: "19 days to Dec 20, skip 12, 11 more → Jan 12." },
  { n: 46, clock: "parent-request-meeting", dates: { parentRequest: "2027-03-10" }, due: "2027-04-17", actionBy: "2027-04-16", why: "15 days to Mar 25, skip 8, 15 more → Sat Apr 17." },
  { n: 47, clock: "parent-request-meeting", dates: { parentRequest: "2027-05-20" }, due: "2027-08-27", why: "14 days to Jun 3, skip summer, 16 more → Aug 27." },
  { n: 48, clock: "parent-request-meeting", dates: { parentRequest: "2026-11-15" }, due: "2026-12-15", why: "Thanksgiving counts." },
  { n: 49, clock: "parent-request-meeting", dates: { parentRequest: "2026-10-15", parentRequestMeetingHeld: "2026-11-01" }, due: "2026-11-14", actionBy: "2026-11-13", status: "met", why: "Met by a meeting on Nov 1." },

  // ── Annual IEP ─────────────────────────────────────────────────────────
  { n: 50, clock: "annual", dates: { lastAnnual: "2025-10-15" }, due: "2026-10-14", why: "One year less a day." },
  { n: 51, clock: "annual", dates: { lastAnnual: "2026-06-20" }, due: "2027-06-19", actionBy: "2027-06-03", why: "Due in summer: act by the last day of school." },
  { n: 52, clock: "annual", dates: { lastAnnual: "2027-02-28" }, due: "2028-02-27", actionBy: "2028-02-25", why: "Sun Feb 27, 2028 → Fri." },
  { n: 53, clock: "annual", dates: { lastAnnual: "2027-03-01" }, due: "2028-02-29", why: "Due on leap day." },
  { n: 54, clock: "annual", dates: { lastAnnual: "2025-12-28" }, due: "2026-12-27", actionBy: "2026-12-18", why: "Due in winter break: act by Fri Dec 18." },
  { n: 55, clock: "annual", dates: { lastAnnual: "2025-10-15", seisAnnualDue: "2026-10-10" }, due: "2026-10-10", actionBy: "2026-10-09", why: "SEIS is earlier: use it." },
  { n: 56, clock: "annual", dates: { lastAnnual: "2025-10-15", seisAnnualDue: "2026-10-15" }, due: "2026-10-14", why: "SEIS is later: keep ours." },
  { n: 57, clock: "annual", dates: { lastAnnual: "2025-09-01" }, due: "2026-08-31", status: "overdue", why: "Overdue as of Oct 10, 2026." },
  { n: 58, clock: "annual", dates: { lastAnnual: "2025-11-01" }, due: "2026-10-31", actionBy: "2026-10-30", status: "due-soon", why: "20 days left." },
  { n: 59, clock: "annual", dates: { lastAnnual: "2026-03-01" }, due: "2027-02-28", actionBy: "2027-02-26", status: "on-track", why: "Sun → Fri." },

  // ── Triennial ──────────────────────────────────────────────────────────
  { n: 60, clock: "triennial", dates: { lastTriennial: "2024-01-20" }, due: "2027-01-19", startBy: "2026-10-24", why: "Start by: 17 days back to Jan 2, skip winter break, 58 more → Oct 24." },
  { n: 61, clock: "triennial", dates: { lastTriennial: "2024-09-15" }, due: "2027-09-14", startBy: "2027-04-23", why: "Start by: 33 days back to Aug 12, skip summer, 42 more → Apr 23." },
  { n: 62, clock: "triennial", dates: { lastTriennial: "2025-02-28" }, due: "2028-02-27", actionBy: "2028-02-25", why: "Sun → Fri." },
];

const TODAY = "2026-10-10";

describe("California clocks: hand-calculated cases", () => {
  it("has at least 50 cases", () => expect(CASES.length).toBeGreaterThanOrEqual(50));

  for (const c of CASES) {
    it(`#${c.n} ${c.clock}: ${c.why}`, () => {
      const exceptions = (c.exceptions ?? []).map((e, i) => ({
        id: `x${i}`,
        clockId: c.clock,
        note: "",
        enteredBy: "maria@district.org",
        enteredAt: "2026-10-01T00:00:00Z",
        kind: "parent-extension" as const,
        ...e,
      }));
      const r = computeClock(RULES_BY_ID[c.clock], student(c.dates, { exceptions }), SAMPLE_CAL, { today: c.today ?? TODAY });
      expect(r).not.toBeNull();
      expect(r!.dueDate).toBe(c.due);
      expect(r!.actionBy).toBe(c.actionBy ?? c.due);
      if (c.startBy) expect(r!.startBy).toBe(c.startBy);
      if (c.status) expect(r!.status).toBe(c.status);
      if (c.eoy !== undefined) expect(r!.endOfYearApplied).toBe(c.eoy);
      if (c.provisional !== undefined) expect(r!.provisional).toBe(c.provisional);
      expect(r!.working.length).toBeGreaterThan(1);
      expect(r!.citation).toMatch(/§|CFR/);
    });
  }
});

describe("working", () => {
  it("shows skipped days and the rule", () => {
    const r = computeClock(RULES_BY_ID["eval-meeting"], student({ consent: "2026-11-09" }), SAMPLE_CAL, { today: TODAY })!;
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].from).toBe("2026-12-21");
    expect(r.working.join("\n")).toContain("Winter break");
    expect(r.citation).toBe("Cal. Educ. Code § 56344(a)");
  });
  it("returns null when the start date is missing", () => {
    expect(computeClock(RULES_BY_ID.annual, student({}), SAMPLE_CAL, { today: TODAY })).toBeNull();
  });
});
