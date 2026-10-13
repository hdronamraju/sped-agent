import { isOpen, type ClockResult } from "../rules/engine";
import { addDays, diffDays, maxDate, type ISODate } from "../rules/dates";
import { isEnglish } from "./language";
import type { Meeting } from "./model";
import type { Student } from "../types";

/** Where a student is in the IEP process, in board order. */
export type StageId = "referred" | "plan" | "assessing" | "meeting" | "review" | "active" | "info";

export const STAGES: { id: StageId; label: string; hint: string }[] = [
  { id: "referred", label: "Referred", hint: "Written referral in; assessment plan not sent yet" },
  { id: "plan", label: "Plan with family", hint: "Assessment plan sent; waiting for signed consent" },
  { id: "assessing", label: "Assessing", hint: "Consent signed; testing and reports under way" },
  { id: "meeting", label: "Meeting being scheduled", hint: "The agent is booking an IEP meeting" },
  { id: "review", label: "Review due", hint: "Has an IEP; annual, triennial or parent-requested meeting due within 60 days" },
  { id: "active", label: "Active IEP", hint: "Has an IEP; nothing due in the next 60 days" },
  { id: "info", label: "Needs info", hint: "Not enough dates to place this student" },
];

/** The steps of a first evaluation, shown as a stepper on the student page. */
export const EVAL_STEPS: StageId[] = ["referred", "plan", "assessing", "meeting", "active"];

export interface StageFlags {
  overdue: boolean;
  interpreter: boolean;
  notOnTracker: boolean;
  noParentEmail: boolean;
}

export interface StudentStage {
  stage: StageId;
  /** When the student entered this stage (for "days in stage"); undefined when unknown. */
  since?: ISODate;
  daysInStage?: number;
  /** The open deadline with the fewest days left. */
  next?: ClockResult;
  flags: StageFlags;
}

/** How far ahead an annual, triennial or parent request moves a student into "Review due". */
export const REVIEW_WINDOW_DAYS = 60;

const ACTIVE_MEETING = new Set<Meeting["status"]>(["planning", "options-ready", "awaiting-parent", "notice-draft", "scheduled", "needs-reschedule", "escalated"]);
const REVIEW_CLOCKS = new Set(["annual", "triennial", "parent-request-meeting"]);

export function studentStage(
  student: Student,
  clocks: ClockResult[],
  meetings: Meeting[],
  today: ISODate,
  opts: { trackerLoaded?: boolean } = {},
): StudentStage {
  const d = student.dates;
  const open = clocks.filter(isOpen).sort((a, b) => a.daysRemaining - b.daysRemaining);
  const flags: StageFlags = {
    overdue: open.some((c) => c.status === "overdue"),
    interpreter: !isEnglish(student.parentLanguage),
    // Same rule as the at-risk list: only students with a deadline passed or within 30 days.
    notOnTracker: !!opts.trackerLoaded && student.inSeis && !student.onTracker && open.some((c) => c.status === "overdue" || c.status === "due-soon"),
    noParentEmail: !student.parentEmail,
  };
  const result = (stage: StageId, since?: ISODate, next = open[0]): StudentStage => ({
    stage,
    since,
    daysInStage: since && since <= today ? diffDays(since, today) : since ? 0 : undefined,
    next,
    flags,
  });

  // 1. A meeting the agent is booking wins over everything else.
  const meeting = meetings
    .filter((m) => m.studentId === student.id && ACTIVE_MEETING.has(m.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (meeting) {
    const clock = clocks.find((c) => c.clockId === meeting.clockId);
    return result("meeting", meeting.createdAt.slice(0, 10), clock ?? open[0]);
  }

  // 2. Evaluation in progress: the furthest step not yet completed by an IEP meeting.
  const ieps = [d.evalMeetingHeld, d.lastAnnual, d.lastTriennial].filter((x): x is ISODate => !!x);
  const meetingAfter = (date: ISODate) => ieps.some((x) => x > date);
  // The step's own clock, even while it is only waiting on the family (not "open").
  const evalClock = (id: string) =>
    clocks.find((c) => c.clockId === id && c.status !== "met" && c.status !== "met-late") ?? open[0];

  if (d.consent && !meetingAfter(d.consent)) return result("assessing", d.consent, evalClock("eval-meeting"));
  if (d.planSent && !meetingAfter(d.planSent) && !(d.consent && d.consent >= d.planSent)) {
    return result("plan", d.planSent, evalClock("parent-decision"));
  }
  if (d.referral && !meetingAfter(d.referral) && !(d.planSent && d.planSent >= d.referral) && !(d.consent && d.consent >= d.referral)) {
    return result("referred", d.referral, evalClock("assessment-plan"));
  }

  // 3. Has an IEP: review due soon, or active.
  const lastIep = maxDate(...ieps);
  const review = open.find((c) => REVIEW_CLOCKS.has(c.clockId) && c.daysRemaining <= REVIEW_WINDOW_DAYS);
  if (review) {
    const since = review.clockId === "parent-request-meeting" ? review.startDate : maxDate(addDays(review.actionBy, -REVIEW_WINDOW_DAYS), review.startDate);
    return result("review", since, review);
  }
  if (lastIep) return result("active", lastIep);
  return result("info");
}

export function stageOf(id: StageId) {
  return STAGES.find((s) => s.id === id)!;
}
