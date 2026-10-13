import { computeStudentClocks, type ClockResult } from "../rules/engine";
import { addDays, diffDays, fmt, type ISODate } from "../rules/dates";
import { addSchoolDays, schoolDaysBetween, type DistrictCalendar } from "../rules/schoolDays";
import type { ClockId } from "../rules/ca-rules";
import type { Student, StudentDateField } from "../types";
import type { Meeting, MeetingType, Settings, TaskMark } from "./model";

export type Severity = "overdue" | "urgent" | "soon" | "upcoming";

export type QueueAction =
  | "send-plan"
  | "follow-up-plan"
  | "schedule"
  | "start-triennial"
  | "approve-options"
  | "approve-notice"
  | "parent-no-reply"
  | "reschedule"
  | "escalated"
  | "assessor-target"
  | "check-reply";

export interface QueueItem {
  key: string;
  studentId: string;
  clockId?: ClockId;
  meetingId?: string;
  title: string;
  detail: string;
  actionBy: ISODate;
  startBy: ISODate;
  daysRemaining: number;
  schoolDaysRemaining: number;
  severity: Severity;
  action: QueueAction;
  escalate: boolean;
  /** Which student date "mark done" fills in. */
  doneField?: StudentDateField;
  result?: ClockResult;
}

export interface Snapshot {
  clocks: ClockResult[];
  byStudent: Map<string, ClockResult[]>;
}

export function computeAll(students: Student[], cal: DistrictCalendar, today: ISODate, settings: Settings): Snapshot {
  const byStudent = new Map<string, ClockResult[]>();
  const clocks: ClockResult[] = [];
  for (const s of students) {
    const rs = computeStudentClocks(s, cal, { today, atRiskDays: settings.atRiskDays });
    byStudent.set(s.id, rs);
    clocks.push(...rs);
  }
  return { clocks, byStudent };
}

export function clockTaskKey(r: ClockResult): string {
  return `${r.studentId}:${r.clockId}:${r.startDate}`;
}

export function meetingTypeFor(r: ClockResult, s: Student): MeetingType {
  if (r.clockId === "eval-meeting") return s.evalType === "triennial" ? "triennial" : "initial";
  if (r.clockId === "parent-request-meeting") return "parent-request";
  if (r.clockId === "triennial") return "triennial";
  return "annual";
}

function severity(daysRemaining: number, settings: Settings): Severity {
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining <= 10) return "urgent";
  if (daysRemaining <= settings.atRiskDays) return "soon";
  return "upcoming";
}

const ACTIVE_MEETING = new Set(["options-ready", "awaiting-parent", "notice-draft", "scheduled", "needs-reschedule", "escalated", "planning"]);

export function assessorTarget(r: ClockResult, cal: DistrictCalendar, settings: Settings): ISODate {
  return addSchoolDays(cal, r.actionBy, -(settings.schedulingBufferSchoolDays + settings.assessorReportSchoolDays));
}

/**
 * P0-5: one list of what needs doing, sorted by days remaining.
 * Clock items show from a week before their start-by date; meeting workflow
 * items show as soon as they need the coordinator.
 */
export function buildQueue(args: {
  students: Student[];
  snapshot: Snapshot;
  meetings: Meeting[];
  marks: Record<string, TaskMark>;
  cal: DistrictCalendar;
  today: ISODate;
  settings: Settings;
}): QueueItem[] {
  const { students, snapshot, meetings, marks, cal, today, settings } = args;
  const items: QueueItem[] = [];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const hidden = (key: string) => {
    const m = marks[key];
    if (!m) return false;
    if (m.status === "done") return true;
    return !!m.until && m.until > today;
  };

  for (const r of snapshot.clocks) {
    const s = studentById.get(r.studentId)!;
    const key = clockTaskKey(r);
    if (hidden(key)) continue;
    if (!(r.status === "overdue" || r.status === "due-soon" || r.status === "on-track" || r.status === "follow-up")) continue;
    if (r.status === "on-track" && today < addDays(r.startBy, -7)) continue;

    const schoolDaysRemaining = schoolDaysBetween(cal, today, r.actionBy);
    const meeting = meetings.find((m) => m.studentId === r.studentId && m.clockId === r.clockId && ACTIVE_MEETING.has(m.status));
    const base = {
      studentId: r.studentId,
      clockId: r.clockId,
      actionBy: r.actionBy,
      startBy: r.startBy,
      daysRemaining: r.daysRemaining,
      schoolDaysRemaining,
      severity: severity(r.daysRemaining, settings),
      escalate: r.daysRemaining < 0 || schoolDaysRemaining <= settings.escalationSchoolDays,
      result: r,
    };

    if (meeting) {
      const mi = meetingItem(meeting, base, cal, today, settings);
      if (mi) items.push({ ...mi, key: `${key}:meeting:${meeting.status}` });
      continue;
    }

    switch (r.clockId) {
      case "assessment-plan":
        items.push({ ...base, key, action: "send-plan", title: "Send assessment plan", detail: "15-day clock from the referral.", doneField: "planSent" });
        break;
      case "parent-decision":
        items.push({ ...base, key, action: "follow-up-plan", title: "Follow up on unsigned assessment plan", detail: "The parent's 15 days are up and no consent is recorded.", doneField: "consent", escalate: false, severity: "soon" });
        break;
      case "eval-meeting": {
        const type = meetingTypeFor(r, s);
        items.push({ ...base, key, action: "schedule", title: `Hold ${type === "triennial" ? "triennial" : "initial"} IEP meeting`, detail: "60-day clock from signed consent.", doneField: "evalMeetingHeld" });
        // P1-4: assessor "finish by" target.
        const target = assessorTarget(r, cal, settings);
        const tKey = `${r.studentId}:testing:${r.startDate}`;
        if (!hidden(tKey) && today >= addSchoolDays(cal, target, -5)) {
          const d = diffDays(today, target);
          items.push({
            ...base,
            key: tKey,
            action: "assessor-target",
            title: d < 0 ? "Testing target slipped" : "Testing due soon",
            detail: `Assessors should finish testing by ${fmt(target)} to leave time for reports and scheduling.`,
            actionBy: target,
            daysRemaining: d,
            schoolDaysRemaining: schoolDaysBetween(cal, today, target),
            severity: d < 0 ? "urgent" : "soon",
            escalate: false,
          });
        }
        break;
      }
      case "parent-request-meeting":
        items.push({ ...base, key, action: "schedule", title: "Hold parent-requested IEP meeting", detail: "30-day clock from the parent's written request.", doneField: "parentRequestMeetingHeld" });
        break;
      case "annual":
        items.push({ ...base, key, action: "schedule", title: "Hold annual IEP", detail: "Due once a year.", doneField: "lastAnnual" });
        break;
      case "triennial": {
        const planAlreadySent = !!s.dates.planSent && s.dates.planSent > r.startDate;
        if (planAlreadySent) {
          if (r.status !== "overdue" && r.status !== "due-soon") break; // the eval-meeting clock carries it
          items.push({ ...base, key, action: "schedule", title: "Hold triennial IEP", detail: "Reevaluation due every 3 years.", doneField: "lastTriennial" });
        } else {
          items.push({ ...base, key, action: "start-triennial", title: "Start triennial: send assessment plan", detail: "Send about 75 days before the 3-year date.", doneField: "planSent" });
        }
        break;
      }
    }
  }
  return items.sort((a, b) => a.daysRemaining - b.daysRemaining || a.studentId.localeCompare(b.studentId));
}

function meetingItem(
  m: Meeting,
  base: Omit<QueueItem, "key" | "action" | "title" | "detail">,
  cal: DistrictCalendar,
  today: ISODate,
  settings: Settings,
): Omit<QueueItem, "key"> | null {
  const withMeeting = { ...base, meetingId: m.id };
  switch (m.status) {
    case "planning":
      return { ...withMeeting, action: "schedule", title: "Finish setting up meeting", detail: "Confirm attendees and find times." };
    case "options-ready":
      return { ...withMeeting, action: "approve-options", title: "Approve times to send to parent", detail: `${m.options.length} times found before the deadline.` };
    case "awaiting-parent": {
      const since = m.lastParentContactAt?.slice(0, 10) ?? today;
      const waited = schoolDaysBetween(cal, since, today);
      if (waited >= settings.parentReplyWaitSchoolDays) {
        return { ...withMeeting, action: "parent-no-reply", title: "No reply from parent", detail: `Sent ${waited} school days ago. Call, or resend in another way.`, severity: "urgent" };
      }
      return { ...withMeeting, action: "check-reply", title: "Waiting on parent's pick", detail: "The agent checks for replies.", severity: base.severity === "overdue" ? "overdue" : "upcoming" };
    }
    case "notice-draft":
      return { ...withMeeting, action: "approve-notice", title: "Approve meeting notice", detail: "The parent picked a time. Calendar holds are placed." };
    case "needs-reschedule":
      return { ...withMeeting, action: "reschedule", title: "Reschedule: someone declined", detail: "New times must still meet the deadline.", severity: "urgent" };
    case "escalated":
      return { ...withMeeting, action: "escalated", title: "No legal time available", detail: m.escalationReason ?? "Needs a decision.", severity: "overdue", escalate: true };
    case "scheduled":
      return null; // on the calendar; the clock is satisfied when the meeting is marked held
    default:
      return null;
  }
}

export interface AtRisk {
  overdue: ClockResult[];
  dueSoon: ClockResult[];
  notOnTracker: { student: Student; results: ClockResult[] }[];
  trackerLoaded: boolean;
}

const LEGAL_CLOCKS = new Set<ClockId>(["assessment-plan", "eval-meeting", "parent-request-meeting", "annual", "triennial"]);

/** P0-4: who is overdue or close, and who the coordinator wasn't tracking. */
export function atRiskList(students: Student[], snapshot: Snapshot): AtRisk {
  const legal = snapshot.clocks.filter((r) => LEGAL_CLOCKS.has(r.clockId));
  const overdue = legal.filter((r) => r.status === "overdue").sort((a, b) => a.daysRemaining - b.daysRemaining);
  const dueSoon = legal.filter((r) => r.status === "due-soon").sort((a, b) => a.daysRemaining - b.daysRemaining);
  const trackerLoaded = students.some((s) => s.onTracker);
  const atRiskIds = new Set([...overdue, ...dueSoon].map((r) => r.studentId));
  const notOnTracker = trackerLoaded
    ? students
        .filter((s) => atRiskIds.has(s.id) && !s.onTracker)
        .map((s) => ({ student: s, results: [...overdue, ...dueSoon].filter((r) => r.studentId === s.id) }))
    : [];
  return { overdue, dueSoon, notOnTracker, trackerLoaded };
}
