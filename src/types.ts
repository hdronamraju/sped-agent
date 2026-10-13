import type { ISODate } from "./rules/dates";

export type StudentDateField =
  | "referral" // written referral for assessment received
  | "planSent" // proposed assessment plan given to parent
  | "consent" // signed assessment plan received
  | "evalMeetingHeld" // initial/triennial IEP meeting held (after consent)
  | "parentRequest" // parent's written request for an IEP meeting received
  | "parentRequestMeetingHeld"
  | "lastAnnual" // date of last annual IEP
  | "lastTriennial" // date of last triennial (re)evaluation IEP
  | "seisAnnualDue" // annual due date as SEIS shows it (for cross-checking)
  | "seisTriennialDue";

export const DATE_FIELDS: { key: StudentDateField; label: string }[] = [
  { key: "referral", label: "Referral received" },
  { key: "planSent", label: "Assessment plan sent" },
  { key: "consent", label: "Consent signed" },
  { key: "evalMeetingHeld", label: "Initial/triennial IEP held" },
  { key: "parentRequest", label: "Parent meeting request" },
  { key: "parentRequestMeetingHeld", label: "Parent-requested meeting held" },
  { key: "lastAnnual", label: "Last annual IEP" },
  { key: "lastTriennial", label: "Last triennial" },
  { key: "seisAnnualDue", label: "Annual due (SEIS)" },
  { key: "seisTriennialDue", label: "Triennial due (SEIS)" },
];

export type EvalType = "initial" | "triennial";

export interface Student {
  id: string; // district/SEIS student ID: the only required field
  name?: string;
  school?: string;
  grade?: string;
  caseManager?: string;
  disability?: string;
  evalType?: EvalType; // what the current consent is for
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  parentLanguage?: string; // e.g. "Spanish"
  dates: Partial<Record<StudentDateField, ISODate>>;
  sources: string[]; // upload ids this student came from
  onTracker: boolean; // appears in the coordinator's own tracker
  inSeis: boolean; // appears in the SEIS export
  exceptions: ClockException[];
}

export type ExceptionKind =
  | "parent-extension" // parent agreed in writing to an extension
  | "parent-not-producing" // parent repeatedly failed to produce the child (34 CFR 300.301(d)(1))
  | "transfer-agreed-date"; // moved mid-assessment; parent and district agreed a date (34 CFR 300.301(d)(2), (e))

export interface ClockException {
  id: string;
  clockId: string;
  kind: ExceptionKind;
  agreedDate?: ISODate;
  note: string;
  documentRef?: string;
  enteredBy: string;
  enteredAt: string; // ISO timestamp
}

export const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  "parent-extension": "Parent's written extension",
  "parent-not-producing": "Parent repeatedly did not produce the child",
  "transfer-agreed-date": "Moved mid-assessment, agreed date",
};
