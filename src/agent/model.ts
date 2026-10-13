import type { ClockId } from "../rules/ca-rules";
import type { ISODate } from "../rules/dates";

export type Role = "coordinator" | "director" | "viewer";

export interface Settings {
  atRiskDays: number; // spec: due within 30 days
  escalationSchoolDays: number; // P1-9 threshold (open question in spec)
  schedulingBufferSchoolDays: number; // N: meetings at least N school days before the deadline
  assessorReportSchoolDays: number; // time between "finish testing" and the meeting
  noticeLeadSchoolDays: number; // earliest meeting is this many school days out, so notice arrives in time
  parentReplyWaitSchoolDays: number; // P1-6: alert when no reply after this long
  meetingMinutes: number;
  dayStart: string; // "07:30"
  dayEnd: string; // "16:30"
  digestEnabled: boolean;
  privacyLight: boolean;
  aiEnabled: boolean;
  anthropicKey?: string;
  googleClientId?: string;
  msClientId?: string;
  msTenant?: string;
  smsWorkerUrl?: string;
  /** Link IT can use to book help with setup (shown in the IT packet). */
  supportUrl?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  atRiskDays: 30,
  escalationSchoolDays: 10,
  schedulingBufferSchoolDays: 5,
  assessorReportSchoolDays: 5,
  noticeLeadSchoolDays: 3,
  parentReplyWaitSchoolDays: 3,
  meetingMinutes: 60,
  dayStart: "07:30",
  dayEnd: "16:30",
  digestEnabled: false,
  privacyLight: false,
  aiEnabled: false,
};

export type StaffRole =
  | "administrator"
  | "gen-ed-teacher"
  | "sped-teacher"
  | "school-psychologist"
  | "speech-therapist"
  | "occupational-therapist"
  | "nurse"
  | "interpreter"
  | "other";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  administrator: "Administrator / district rep",
  "gen-ed-teacher": "General education teacher",
  "sped-teacher": "Special education teacher / case manager",
  "school-psychologist": "School psychologist",
  "speech-therapist": "Speech-language pathologist",
  "occupational-therapist": "Occupational therapist",
  nurse: "School nurse",
  interpreter: "Interpreter",
  other: "Other",
};

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  school?: string; // blank = district-wide
  languages?: string[]; // interpreters
}

export type MeetingType = "initial" | "triennial" | "annual" | "parent-request";

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  initial: "Initial IEP",
  triennial: "Triennial IEP",
  annual: "Annual IEP",
  "parent-request": "Parent-requested IEP",
};

export interface Attendee {
  key: string;
  role: StaffRole | "parent";
  name: string;
  email?: string;
  required: boolean;
  reason: string; // why they're on the list (rule or coordinator)
  staffId?: string;
  response?: "accepted" | "declined" | "tentative" | "needsAction";
}

export interface Slot {
  date: ISODate;
  start: string; // "15:30" local California time
  end: string;
}

export interface OutboundMessage {
  id: string;
  kind: "parent-options" | "notice" | "notice-update" | "reminder" | "it-packet" | "digest" | "escalation";
  to: string[];
  subject: string;
  body: string;
  language: string;
  status: "draft" | "approved" | "sent" | "failed";
  checks?: NoticeCheck[];
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  providerMessageId?: string;
  threadId?: string;
  error?: string;
}

export interface NoticeCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export type MeetingStatus =
  | "planning" // attendees being set
  | "options-ready" // three times found, parent message drafted, awaiting approval
  | "awaiting-parent" // message sent, waiting for a pick
  | "notice-draft" // parent picked; hold placed; notice awaiting approval
  | "scheduled" // notice sent, event confirmed
  | "needs-reschedule"
  | "escalated" // no legal time available
  | "held"
  | "cancelled";

export interface Meeting {
  id: string;
  studentId: string;
  clockId: ClockId;
  type: MeetingType;
  deadline: ISODate; // act-by date of the clock
  latestAllowed: ISODate; // deadline minus the scheduling buffer
  attendees: Attendee[];
  options: Slot[];
  chosen?: Slot;
  status: MeetingStatus;
  messages: OutboundMessage[];
  eventId?: string;
  location: string;
  parentLanguage: string;
  createdAt: string;
  lastParentContactAt?: string;
  parentReplies: { at: string; body: string; parsed: string }[];
  escalationReason?: string;
}

export interface TaskMark {
  status: "done" | "snoozed";
  until?: ISODate;
  reason?: string;
  by: string;
  at: string;
}
