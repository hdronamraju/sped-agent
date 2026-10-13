import type { ClockException, Student } from "../types";
import { CA_RULES, RULES_VERSION, type ClockId, type ClockRule } from "./ca-rules";
import { addDays, addYears, diffDays, fmt, isWeekend, type ISODate } from "./dates";
import {
  addSchoolDays,
  countCaliforniaDays,
  estimatedNextFirstDay,
  isSchoolDay,
  nextYearFirstDay,
  schoolDayOnOrBefore,
  sortedYears,
  yearContaining,
  type DistrictCalendar,
  type ExcludedSpan,
} from "./schoolDays";

export type ClockStatus =
  | "overdue"
  | "due-soon" // within the at-risk window (default 30 days)
  | "on-track"
  | "met"
  | "met-late"
  | "waiting" // not-before clocks: parent's decision period still running
  | "follow-up" // not-before clocks: period over, no decision recorded
  | "exception"; // timeline suspended by a recorded exception

export interface ClockResult {
  studentId: string;
  clockId: ClockId;
  label: string;
  citation: string;
  citationUrl: string;
  rulesVersion: string;
  startEvent: string;
  startDate: ISODate;
  /** Legal date: deadline for "due" clocks, earliest follow-up for "not-before" clocks. */
  dueDate: ISODate;
  /** Last school day on or before the due date: the practical deadline. */
  actionBy: ISODate;
  /** When work should start to make the act-by date comfortably. */
  startBy: ISODate;
  status: ClockStatus;
  daysRemaining: number; // calendar days from today to actionBy (negative when overdue)
  completedOn?: ISODate;
  skipped: ExcludedSpan[];
  working: string[];
  warnings: string[];
  provisional: boolean;
  exception?: ClockException;
  endOfYearApplied?: boolean;
}

export interface EngineOptions {
  today: ISODate;
  /** Calendar days ahead that count as "due soon" (spec: 30). */
  atRiskDays?: number;
}

export function computeClock(
  rule: ClockRule,
  student: Student,
  cal: DistrictCalendar,
  opts: EngineOptions,
): ClockResult | null {
  const start = student.dates[rule.startField];
  if (!start) return null;
  const working: string[] = [];
  const warnings: string[] = [];
  let skipped: ExcludedSpan[] = [];
  let provisional = false;
  let due: ISODate;

  working.push(`Start: ${rule.startEvent.toLowerCase()} on ${fmt(start)} (day 0).`);

  if (rule.method === "ca-days") {
    const r = countCaliforniaDays(cal, start, rule.length);
    due = r.end;
    skipped = r.skipped;
    provisional = r.provisional;
    working.push(`Count ${rule.length} days, skipping days between sessions and vacations of more than 5 school days.`);
    for (const s of skipped) {
      const n = diffDays(s.from, s.to) + 1;
      working.push(`Skipped ${fmt(s.from)} – ${fmt(s.to)} (${n} days): ${s.reason}.`);
    }
    if (!skipped.length) working.push("No breaks to skip in this window.");
  } else if (rule.method === "calendar-days") {
    due = addDays(start, rule.length);
    working.push(`Add ${rule.length} calendar days.`);
  } else {
    due = addDays(addYears(start, rule.length), -1);
    working.push(
      `${rule.length === 1 ? "One year" : `${rule.length} years`} after ${fmt(start)}, less one day.`,
    );
  }
  working.push(`${rule.kind === "due" ? "Due" : "Parent's decision period ends"}: ${fmt(due)}.`);

  // End-of-year rule.
  let endOfYearApplied = false;
  if (rule.endOfYear) {
    const eoy = rule.endOfYear;
    const trigger = student.dates[eoy.triggerField];
    const year = trigger ? yearContaining(cal, trigger) : undefined;
    if (trigger && year) {
      const before = diffDays(trigger, year.lastDay);
      if (before >= 0 && before <= eoy.withinDaysOfYearEnd) {
        const next = nextYearFirstDay(cal, year.lastDay);
        if (next) {
          const eoyDue = addDays(next.date, eoy.dueDayOfNextYear - 1);
          const applies = rule.id !== "eval-meeting" || start < next.date;
          if (applies) {
            working.push(
              `End-of-year rule: ${eoy.triggerField === "referral" ? "referral" : "start"} was ${before} days before the last day of school (${fmt(year.lastDay)}). ${eoy.text}`,
            );
            const useEoy = eoy.combine === "replace" || eoyDue < due;
            working.push(
              `Day ${eoy.dueDayOfNextYear} of the next school year (first day ${fmt(next.date)}${next.provisional ? ", estimated" : ""}) is ${fmt(eoyDue)}. ${
                eoy.combine === "replace" ? "This replaces the normal count." : useEoy ? "It is earlier, so it applies." : "The normal count is earlier, so it stands."
              }`,
            );
            if (useEoy) {
              due = eoyDue;
              endOfYearApplied = true;
              provisional = provisional || next.provisional;
            }
          }
        }
      }
    }
  }

  // Exceptions (latest entry wins).
  const exception = [...student.exceptions]
    .filter((e) => e.clockId === rule.id)
    .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
    .at(-1);
  if (exception) {
    if ((exception.kind === "parent-extension" || exception.kind === "transfer-agreed-date") && exception.agreedDate) {
      working.push(
        `Exception: ${exception.kind === "parent-extension" ? "parent agreed in writing to extend" : "agreed date after a mid-assessment move"} to ${fmt(exception.agreedDate)} (entered by ${exception.enteredBy}).`,
      );
      due = exception.agreedDate;
    } else if (exception.kind === "parent-not-producing") {
      working.push(`Exception: parent repeatedly did not produce the child (entered by ${exception.enteredBy}). Timeline does not apply while this stands.`);
    }
  }

  // Cross-check against SEIS's own dates; if SEIS is earlier, use it.
  const seisField = rule.id === "annual" ? "seisAnnualDue" : rule.id === "triennial" ? "seisTriennialDue" : undefined;
  const seis = seisField ? student.dates[seisField] : undefined;
  if (seis && seis !== due) {
    const d = diffDays(due, seis);
    warnings.push(`SEIS shows ${fmt(seis)} (${Math.abs(d)} days ${d > 0 ? "later" : "earlier"}).${d < 0 ? " We use the earlier SEIS date to stay safe." : ""}`);
    if (seis < due) {
      due = seis;
      working.push(`SEIS shows an earlier due date, ${fmt(seis)}. Using it.`);
    }
  }

  // Practical act-by date.
  let actionBy = due;
  if (rule.kind === "due") {
    actionBy = actByDate(cal, due);
    if (actionBy !== due) {
      working.push(`${fmt(due)} is not a school day, so act by the last school day before it: ${fmt(actionBy)}.`);
    }
  }

  let startBy: ISODate;
  if (rule.leadDays) {
    startBy = countCaliforniaDays(cal, due, -rule.leadDays).end;
    working.push(`Start by: ${rule.leadDays} days before the due date, counted the same way: ${fmt(startBy)}.`);
  } else {
    startBy = rule.kind === "due" ? addSchoolDays(cal, actionBy, -(rule.startBySchoolDays ?? 5)) : due;
  }

  // Completion.
  // Annual/triennial are rolling clocks (satisfiedBy is empty): the start date is
  // the last one held, so they're never "completed", only due again.
  const completedOn = rule.satisfiedBy
    .map((f) => student.dates[f])
    .filter((d): d is ISODate => !!d && d > start)
    .sort()[0];
  const atRiskDays = opts.atRiskDays ?? 30;
  const daysRemaining = diffDays(opts.today, actionBy);
  let status: ClockStatus;
  if (exception?.kind === "parent-not-producing") status = "exception";
  else if (rule.kind === "not-before") {
    status = completedOn ? "met" : opts.today < due ? "waiting" : "follow-up";
  } else if (completedOn) {
    status = completedOn <= due ? "met" : "met-late";
    working.push(`Done on ${fmt(completedOn)}${status === "met-late" ? `, ${diffDays(due, completedOn)} days late` : ""}.`);
  } else if (daysRemaining < 0) status = "overdue";
  else if (daysRemaining <= atRiskDays) status = "due-soon";
  else status = "on-track";

  if (provisional) warnings.push("Uses an estimated first day for next school year. Upload next year's calendar to confirm.");

  return {
    studentId: student.id,
    clockId: rule.id,
    label: rule.label,
    citation: rule.citation,
    citationUrl: rule.citationUrl,
    rulesVersion: RULES_VERSION,
    startEvent: rule.startEvent,
    startDate: start,
    dueDate: due,
    actionBy,
    startBy,
    status,
    daysRemaining,
    completedOn,
    skipped,
    working,
    warnings,
    provisional,
    exception,
    endOfYearApplied,
  };
}

/**
 * Last school day on or before d. Beyond the loaded calendars we only know
 * weekends (and the summer right after the last loaded year), so we don't guess.
 */
export function actByDate(cal: DistrictCalendar, d: ISODate): ISODate {
  if (isSchoolDay(cal, d)) return d;
  const years = sortedYears(cal);
  const first = years[0];
  const last = years.at(-1);
  const beyond = !first || d < first.firstDay || (last && d >= estimatedNextFirstDay(last));
  if (beyond) {
    let x = d;
    while (isWeekend(x)) x = addDays(x, -1);
    return x;
  }
  return schoolDayOnOrBefore(cal, d);
}

export function computeStudentClocks(student: Student, cal: DistrictCalendar, opts: EngineOptions): ClockResult[] {
  const results: ClockResult[] = [];
  for (const rule of CA_RULES) {
    const r = computeClock(rule, student, cal, opts);
    if (r) results.push(r);
  }
  return results;
}

/** Open (actionable) clocks: not met, not waiting on the parent. */
export function isOpen(r: ClockResult): boolean {
  return r.status === "overdue" || r.status === "due-soon" || r.status === "on-track" || r.status === "follow-up";
}
