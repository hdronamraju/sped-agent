import { Link } from "react-router-dom";
import { MEETING_TYPE_LABELS, type MeetingStatus } from "../../agent/model";
import { fmt } from "../../rules/dates";
import { useStore } from "../../store/store";
import { Badge, Empty, PageHeader } from "../components";
import { studentLabel, useDerived } from "../useDerived";

const STATUS: Record<MeetingStatus, { label: string; color: "red" | "amber" | "green" | "blue" | "gray" | "violet" }> = {
  planning: { label: "Setting up", color: "gray" },
  "options-ready": { label: "Approve times", color: "amber" },
  "awaiting-parent": { label: "Waiting on parent", color: "blue" },
  "notice-draft": { label: "Approve notice", color: "amber" },
  scheduled: { label: "Scheduled", color: "green" },
  "needs-reschedule": { label: "Reschedule", color: "red" },
  escalated: { label: "No legal time", color: "red" },
  held: { label: "Held", color: "violet" },
  cancelled: { label: "Cancelled", color: "gray" },
};

export function MeetingsPage() {
  const meetings = useStore((s) => s.meetings);
  const { byId } = useDerived();
  const order: MeetingStatus[] = ["escalated", "needs-reschedule", "options-ready", "notice-draft", "planning", "awaiting-parent", "scheduled", "held", "cancelled"];
  const sorted = [...meetings].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.deadline.localeCompare(b.deadline));
  return (
    <div>
      <PageHeader title="Meetings" subtitle="Everything the agent is scheduling. Items that need your approval are at the top." />
      {sorted.length === 0 ? (
        <Empty title="No meetings yet">Start one from Today or a student page with "Schedule".</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-lg bg-raised shadow-card">
          {sorted.map((m) => (
            <li key={m.id}>
              <Link to={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-hover">
                <span className="w-56 font-medium">{studentLabel(byId.get(m.studentId))}</span>
                <span className="w-40 text-fg-muted">{MEETING_TYPE_LABELS[m.type]}</span>
                <span className="w-56">{m.chosen ? `${fmt(m.chosen.date)} ${m.chosen.start}` : <span className="text-fg-muted">no time yet</span>}</span>
                <span className="text-fg-muted">by {fmt(m.deadline)}</span>
                <span className="ml-auto">
                  <Badge color={STATUS[m.status].color}>{STATUS[m.status].label}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
