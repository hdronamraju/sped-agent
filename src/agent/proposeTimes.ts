import { addDays, type ISODate } from "../rules/dates";
import { addSchoolDays, isSchoolDay, type DistrictCalendar } from "../rules/schoolDays";
import type { Settings, Slot } from "./model";
import { fromMinutes, laToUtc, toMinutes } from "./time";

export interface Busy {
  start: number; // UTC ms
  end: number;
}

export interface ProposeInput {
  cal: DistrictCalendar;
  today: ISODate;
  deadline: ISODate; // act-by date for the clock
  earliest?: ISODate; // e.g. after testing and report writing
  busy: Record<string, Busy[]>; // by attendee email
  settings: Pick<Settings, "schedulingBufferSchoolDays" | "noticeLeadSchoolDays" | "meetingMinutes" | "dayStart" | "dayEnd">;
  exclude?: Slot[]; // times already declined
  count?: number;
}

export interface ProposeResult {
  slots: Slot[];
  windowStart: ISODate;
  latestAllowed: ISODate;
  /** True when the only free times are inside the buffer (still before the legal deadline). */
  insideBuffer: boolean;
  /** Set when fewer than `count` legal times exist: the coordinator or director must step in. */
  escalate?: string;
}

/** Times families can most often make: right after school, then early morning. */
const PREFERRED = ["15:00", "15:30", "08:00", "14:30", "07:30", "13:00", "10:00", "11:00", "09:00", "12:00", "14:00", "16:00"];

function free(busy: Record<string, Busy[]>, start: number, end: number): boolean {
  return Object.values(busy).every((list) => list.every((b) => b.end <= start || b.start >= end));
}

/**
 * Up to three times inside the legal window, every required attendee free,
 * at least N school days before the deadline. Never proposes a time past the
 * deadline: if none fit, it says so and the caller escalates.
 */
export function proposeTimes(input: ProposeInput): ProposeResult {
  const { cal, settings } = input;
  const count = input.count ?? 3;
  let windowStart = addSchoolDays(cal, input.today, settings.noticeLeadSchoolDays);
  if (input.earliest && input.earliest > windowStart) windowStart = input.earliest;
  while (!isSchoolDay(cal, windowStart) && windowStart <= input.deadline) windowStart = addDays(windowStart, 1);
  const latestAllowed = addSchoolDays(cal, input.deadline, -settings.schedulingBufferSchoolDays);

  const find = (until: ISODate): Slot[] => {
    const out: Slot[] = [];
    const dayStart = toMinutes(settings.dayStart);
    const lastStart = toMinutes(settings.dayEnd) - settings.meetingMinutes;
    for (let d = windowStart; d <= until && out.length < count; d = addDays(d, 1)) {
      if (!isSchoolDay(cal, d)) continue;
      const times = [...PREFERRED.filter((t) => toMinutes(t) >= dayStart && toMinutes(t) <= lastStart)];
      for (let m = dayStart; m <= lastStart; m += 30) if (!times.includes(fromMinutes(m))) times.push(fromMinutes(m));
      for (const t of times) {
        const end = fromMinutes(toMinutes(t) + settings.meetingMinutes);
        if (input.exclude?.some((x) => x.date === d && x.start === t)) continue;
        if (free(input.busy, laToUtc(d, t), laToUtc(d, end))) {
          out.push({ date: d, start: t, end });
          break; // one option per day, so families get a real choice
        }
      }
    }
    return out;
  };

  let slots = latestAllowed >= windowStart ? find(latestAllowed) : [];
  let insideBuffer = false;
  if (slots.length < count) {
    const more = find(input.deadline).filter((s) => !slots.some((x) => x.date === s.date));
    if (more.length) {
      insideBuffer = true;
      slots = [...slots, ...more].slice(0, count);
    }
  }
  let escalate: string | undefined;
  if (slots.length === 0) escalate = "No time before the legal deadline works for every required attendee.";
  else if (slots.length < count) escalate = `Only ${slots.length} time(s) before the deadline work for everyone.`;
  return { slots, windowStart, latestAllowed, insideBuffer, escalate };
}
