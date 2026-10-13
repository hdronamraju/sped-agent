import type { StudentDateField } from "../types";

/**
 * California special education clocks, as data. A law change is an edit here
 * plus a test case, never a code change in the engine.
 *
 * Each rule notes how we read any ambiguity. Where the statute allows more than
 * one reading we pick the one that gives the earlier date, so a district relying
 * on us is never late. Review by a California special-ed attorney or SELPA is
 * required before a pilot.
 */

export const RULES_VERSION = "CA-2026.10-r1";

export type CountingMethod =
  /** Calendar days, skipping days between sessions and vacations > 5 school days. */
  | "ca-days"
  /** Plain calendar days. */
  | "calendar-days"
  /** Whole years from the start date; due the day before the anniversary. */
  | "years";

export interface EndOfYearRule {
  /** Applies when the trigger date is this many calendar days or fewer before the last day of the school year. */
  withinDaysOfYearEnd: number;
  /** Which student date the "within N days of year end" test uses. */
  triggerField: StudentDateField;
  /** Then the clock is due this many days into the next school year (first day = day 1). */
  dueDayOfNextYear: number;
  /** "replace": the year-end date is the deadline. "earlier": the earlier of this and the normal clock. */
  combine: "replace" | "earlier";
  text: string;
}

export interface ClockRule {
  id: ClockId;
  label: string;
  shortLabel: string;
  startField: StudentDateField;
  startEvent: string;
  length: number;
  method: CountingMethod;
  /** "due" is a deadline; "not-before" is a minimum wait (the parent's decision period). */
  kind: "due" | "not-before";
  endOfYear?: EndOfYearRule;
  /** Student dates that, on or after the start date, mean the clock was satisfied. */
  satisfiedBy: StudentDateField[];
  /** School days before the act-by date when work should start (shown as "start by"). */
  startBySchoolDays?: number;
  /** For triennials: California days before the due date to send the assessment plan (overrides startBySchoolDays). */
  leadDays?: number;
  citation: string;
  citationUrl: string;
  summary: string;
  interpretation: string;
  allowedExceptions: ("parent-extension" | "parent-not-producing" | "transfer-agreed-date")[];
}

export type ClockId =
  | "assessment-plan"
  | "parent-decision"
  | "eval-meeting"
  | "parent-request-meeting"
  | "annual"
  | "triennial";

export const CA_RULES: ClockRule[] = [
  {
    id: "assessment-plan",
    label: "Assessment plan to parent",
    shortLabel: "Assessment plan",
    startField: "referral",
    startEvent: "Written referral received",
    length: 15,
    method: "ca-days",
    kind: "due",
    endOfYear: {
      withinDaysOfYearEnd: 10,
      triggerField: "referral",
      dueDayOfNextYear: 10,
      combine: "replace",
      text: "Referral made 10 days or less before the end of the school year: plan due within 10 days after the next school year begins.",
    },
    satisfiedBy: ["planSent", "consent"],
    startBySchoolDays: 5,
    citation: "Cal. Educ. Code § 56321(a)",
    citationUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=56321",
    summary: "A proposed assessment plan goes to the parent within 15 days of a written referral.",
    interpretation:
      "Referral day is day 0. The next school year's first day counts as day 1 of the 10. Vacations count as 'more than 5 school days' by weekdays inside the district's declared break dates.",
    allowedExceptions: ["parent-extension"],
  },
  {
    id: "parent-decision",
    label: "Parent decision on assessment plan",
    shortLabel: "Parent decision",
    startField: "planSent",
    startEvent: "Assessment plan received by parent",
    length: 15,
    method: "calendar-days",
    kind: "not-before",
    satisfiedBy: ["consent"],
    citation: "Cal. Educ. Code § 56321(c)(4)",
    citationUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=56321",
    summary: "The parent has at least 15 days to decide. Follow up on unsigned plans after that.",
    interpretation:
      "We treat the day the plan was sent as the day it was received. If it was mailed, enter the receipt date instead.",
    allowedExceptions: [],
  },
  {
    id: "eval-meeting",
    label: "Initial / triennial IEP meeting",
    shortLabel: "Eval IEP",
    startField: "consent",
    startEvent: "Signed assessment plan received",
    length: 60,
    method: "ca-days",
    kind: "due",
    endOfYear: {
      withinDaysOfYearEnd: 30,
      triggerField: "referral",
      dueDayOfNextYear: 30,
      combine: "earlier",
      text: "Referral made 30 days or less before the end of the school year: IEP due within 30 days after the next school year begins.",
    },
    satisfiedBy: ["evalMeetingHeld", "lastAnnual", "lastTriennial"],
    startBySchoolDays: 15,
    citation: "Cal. Educ. Code § 56344(a)",
    citationUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=56344",
    summary: "The IEP meeting is held within 60 days of signed consent, ending at the meeting.",
    interpretation:
      "Consent day is day 0. For year-end referrals we use the earlier of the 60-day count and day 30 of the next school year, and only when consent arrives before that year starts.",
    allowedExceptions: ["parent-extension", "parent-not-producing", "transfer-agreed-date"],
  },
  {
    id: "parent-request-meeting",
    label: "Parent-requested IEP meeting",
    shortLabel: "Parent request",
    startField: "parentRequest",
    startEvent: "Parent's written request received",
    length: 30,
    method: "ca-days",
    kind: "due",
    satisfiedBy: ["parentRequestMeetingHeld", "lastAnnual", "evalMeetingHeld"],
    startBySchoolDays: 10,
    citation: "Cal. Educ. Code § 56043(l)",
    citationUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=56043",
    summary: "A meeting the parent asks for in writing is held within 30 days.",
    interpretation: "Request day is day 0. Same day counting as other California clocks.",
    allowedExceptions: ["parent-extension"],
  },
  {
    id: "annual",
    label: "Annual IEP review",
    shortLabel: "Annual",
    startField: "lastAnnual",
    startEvent: "Last annual IEP",
    length: 1,
    method: "years",
    kind: "due",
    satisfiedBy: [],
    startBySchoolDays: 20,
    citation: "Cal. Educ. Code § 56043(d); 34 CFR 300.324(b)(1)",
    citationUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=56043",
    summary: "The IEP team reviews the IEP at least once a year.",
    interpretation:
      "Due the day before the anniversary of the last annual IEP. If that falls in summer or on a non-school day, act by the last school day before it.",
    allowedExceptions: [],
  },
  {
    id: "triennial",
    label: "Triennial reevaluation",
    shortLabel: "Triennial",
    startField: "lastTriennial",
    startEvent: "Last triennial IEP",
    length: 3,
    method: "years",
    kind: "due",
    satisfiedBy: [],
    leadDays: 75,
    citation: "Cal. Educ. Code § 56381(a)(2); 34 CFR 300.303(b)(2)",
    citationUrl: "https://www.ecfr.gov/current/title-34/subtitle-B/chapter-III/part-300/subpart-D/subject-group-ECFR4b6bea6ff2f5d0b/section-300.303",
    summary: "Reevaluate at least every 3 years. Send the assessment plan about 75 days early (60-day assessment + 15-day parent review).",
    interpretation:
      "Due the day before the third anniversary. 'Start by' counts 75 California days back from the due date.",
    allowedExceptions: ["parent-extension"],
  },
];

export const RULES_BY_ID = Object.fromEntries(CA_RULES.map((r) => [r.id, r])) as Record<ClockId, ClockRule>;

/** The spec's description of how days are counted, shown wherever a date's working is shown. */
export const COUNTING_NOTE =
  "California counts calendar days but skips days between regular school sessions and school vacations of more than 5 school days (Cal. Educ. Code § 56321(a), § 56344(a), § 56043).";
