import type { Student } from "../types";
import { isEnglish } from "./language";
import type { Attendee, MeetingType, StaffMember, StaffRole } from "./model";

/**
 * Required IEP team members (Cal. Educ. Code § 56341(b); 34 CFR 300.321).
 * Assessors who did testing must be there to explain results at initial and
 * triennial meetings (§ 56341(b)(5)). An interpreter is added when the parent's
 * language isn't English (§ 56341.5(i)).
 */
const REQUIRED: Record<MeetingType, { role: StaffRole; reason: string }[]> = {
  initial: [
    { role: "administrator", reason: "District representative (EC 56341(b)(4))" },
    { role: "gen-ed-teacher", reason: "General education teacher (EC 56341(b)(2))" },
    { role: "sped-teacher", reason: "Special education teacher or provider (EC 56341(b)(3))" },
    { role: "school-psychologist", reason: "Interprets assessment results (EC 56341(b)(5))" },
  ],
  triennial: [
    { role: "administrator", reason: "District representative (EC 56341(b)(4))" },
    { role: "gen-ed-teacher", reason: "General education teacher (EC 56341(b)(2))" },
    { role: "sped-teacher", reason: "Special education teacher or provider (EC 56341(b)(3))" },
    { role: "school-psychologist", reason: "Interprets assessment results (EC 56341(b)(5))" },
  ],
  annual: [
    { role: "administrator", reason: "District representative (EC 56341(b)(4))" },
    { role: "gen-ed-teacher", reason: "General education teacher (EC 56341(b)(2))" },
    { role: "sped-teacher", reason: "Special education teacher or provider (EC 56341(b)(3))" },
  ],
  "parent-request": [
    { role: "administrator", reason: "District representative (EC 56341(b)(4))" },
    { role: "gen-ed-teacher", reason: "General education teacher (EC 56341(b)(2))" },
    { role: "sped-teacher", reason: "Special education teacher or provider (EC 56341(b)(3))" },
  ],
};

function pick(staff: StaffMember[], role: StaffRole, student: Student, language?: string): StaffMember | undefined {
  const ofRole = staff.filter((s) => s.role === role);
  const lang = (s: StaffMember) => !language || role !== "interpreter" || (s.languages ?? []).some((l) => l.toLowerCase() === language.toLowerCase());
  const caseManager = role === "sped-teacher" && student.caseManager
    ? ofRole.find((s) => s.name.toLowerCase() === student.caseManager!.toLowerCase())
    : undefined;
  return (
    caseManager ??
    ofRole.find((s) => s.school && s.school === student.school && lang(s)) ??
    ofRole.find((s) => !s.school && lang(s)) ??
    ofRole.find(lang)
  );
}

export function requiredAttendees(type: MeetingType, student: Student, staff: StaffMember[]): Attendee[] {
  const out: Attendee[] = [
    {
      key: "parent",
      role: "parent",
      name: student.parentName || "Parent/guardian",
      email: student.parentEmail,
      required: true,
      reason: "Parent participation (EC 56341(b)(1), 56341.5)",
    },
  ];
  for (const r of REQUIRED[type]) {
    const s = pick(staff, r.role, student);
    out.push({
      key: r.role,
      role: r.role,
      name: s?.name ?? "Not assigned",
      email: s?.email,
      staffId: s?.id,
      required: true,
      reason: r.reason,
    });
  }
  if (!isEnglish(student.parentLanguage)) {
    const s = pick(staff, "interpreter", student, student.parentLanguage);
    out.push({
      key: "interpreter",
      role: "interpreter",
      name: s?.name ?? `${student.parentLanguage} interpreter (not assigned)`,
      email: s?.email,
      staffId: s?.id,
      required: true,
      reason: `Parent's language is ${student.parentLanguage} (EC 56341.5(i))`,
    });
  }
  return out;
}

export function missingAttendees(attendees: Attendee[]): Attendee[] {
  return attendees.filter((a) => a.required && a.role !== "parent" && !a.email);
}
