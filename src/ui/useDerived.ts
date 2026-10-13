import { useMemo } from "react";
import { atRiskList, buildQueue, computeAll } from "../agent/queue";
import { useStore } from "../store/store";

/** Deadlines, queue and at-risk list, recomputed whenever their inputs change. */
export function useDerived() {
  const students = useStore((s) => s.students);
  const calendar = useStore((s) => s.calendar);
  const settings = useStore((s) => s.settings);
  const meetings = useStore((s) => s.meetings);
  const marks = useStore((s) => s.marks);
  const todayOverride = useStore((s) => s.todayOverride);
  const today = useStore((s) => s.today)();
  return useMemo(() => {
    const snapshot = computeAll(students, calendar, today, settings);
    const queue = buildQueue({ students, snapshot, meetings, marks, cal: calendar, today, settings });
    const atRisk = atRiskList(students, snapshot);
    const byId = new Map(students.map((s) => [s.id, s]));
    return { snapshot, queue, atRisk, byId, today, ready: calendar.years.length > 0 && students.length > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, calendar, settings, meetings, marks, today, todayOverride]);
}

export function studentLabel(s?: { id: string; name?: string }) {
  if (!s) return "";
  return s.name ? `${s.name}` : `Student ${s.id}`;
}
