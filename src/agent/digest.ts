import { fmtShort } from "../rules/dates";
import type { Student } from "../types";
import type { AtRisk, QueueItem } from "./queue";

function who(s: Student | undefined, id: string) {
  return s?.name ? `${s.name} (${id})` : id;
}

/** P0-5: the optional morning email to the coordinator (internal, so no approval gate). */
export function buildDigest(items: QueueItem[], atRisk: AtRisk, students: Student[], today: string, appUrl: string) {
  const by = new Map(students.map((s) => [s.id, s]));
  const line = (i: QueueItem) =>
    `• ${who(by.get(i.studentId), i.studentId)}: ${i.title}, act by ${fmtShort(i.actionBy)} (${i.daysRemaining < 0 ? `${-i.daysRemaining} days overdue` : `${i.daysRemaining} days`})`;
  const overdue = items.filter((i) => i.severity === "overdue");
  const urgent = items.filter((i) => i.severity === "urgent");
  const rest = items.filter((i) => i.severity === "soon");
  const escal = items.filter((i) => i.escalate);
  const body = [
    `Good morning. Here's what needs doing today (${today}).`,
    "",
    `Overdue: ${atRisk.overdue.length} · Due within 30 days: ${atRisk.dueSoon.length}${atRisk.trackerLoaded ? ` · Not on your tracker: ${atRisk.notOnTracker.length}` : ""}`,
    "",
    overdue.length ? `OVERDUE\n${overdue.map(line).join("\n")}\n` : "",
    urgent.length ? `NEXT 10 DAYS\n${urgent.map(line).join("\n")}\n` : "",
    rest.length ? `COMING UP\n${rest.slice(0, 15).map(line).join("\n")}${rest.length > 15 ? `\n…and ${rest.length - 15} more` : ""}\n` : "",
    escal.length ? `AT RISK OF MISSING THE DEADLINE (director alerted)\n${escal.map(line).join("\n")}\n` : "",
    `Open your queue: ${appUrl}`,
  ].filter(Boolean).join("\n");
  return { subject: `IEP queue for ${today}: ${overdue.length} overdue, ${urgent.length} this week and next`, body };
}
