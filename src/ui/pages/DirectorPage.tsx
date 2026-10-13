import { Link } from "react-router-dom";
import { CA_RULES } from "../../rules/ca-rules";
import { useStore } from "../../store/store";
import { Badge, Card, DaysLeft, PageHeader, Stat } from "../components";
import { studentLabel, useDerived } from "../useDerived";
import { NotReady } from "./AtRiskPage";

/** P1-9 escalations, plus a first cut of the P2 compliance view. */
export function DirectorPage() {
  const { queue, snapshot, byId, ready } = useDerived();
  const meetings = useStore((s) => s.meetings);
  if (!ready) return <NotReady />;
  const escalations = queue.filter((q) => q.escalate);
  const done = snapshot.clocks.filter((c) => c.status === "met" || c.status === "met-late");
  const onTime = done.filter((c) => c.status === "met").length;
  const schools = [...new Set([...byId.values()].map((s) => s.school ?? "Unknown school"))].sort();
  const held = meetings.filter((m) => m.status === "held");
  return (
    <div>
      <PageHeader title="Director view" subtitle="Deadlines at risk across the district, and how often clocks are met on time." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Escalations" value={escalations.length} tone={escalations.length ? "red" : "default"} />
        <Stat label="Overdue" value={snapshot.clocks.filter((c) => c.status === "overdue").length} tone="red" />
        <Stat label="On-time rate (completed)" value={done.length ? `${Math.round((onTime / done.length) * 100)}%` : "–"} />
        <Stat label="Meetings held via agent" value={held.length} />
      </div>
      <Card className="mb-6" title="At risk of missing the deadline" subtitle="Overdue, or inside the escalation threshold with no meeting scheduled.">
        {escalations.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing needs you.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {escalations.map((q) => (
              <li key={q.key} className="flex flex-wrap items-center gap-x-4 py-2">
                <Link className="w-52 font-medium hover:underline" to={`/students/${q.studentId}`}>
                  {studentLabel(byId.get(q.studentId))}
                </Link>
                <span className="w-60">{q.title}</span>
                <span className="w-36">act by {q.actionBy}</span>
                <DaysLeft days={q.daysRemaining} />
                <span className="ml-auto text-fg-muted">{byId.get(q.studentId)?.school}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Open clocks by school">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] tracking-[0.08em] text-fg-muted uppercase">
              <tr>
                <th className="py-1 pr-3 font-medium">School</th>
                {CA_RULES.filter((r) => r.kind === "due").map((r) => (
                  <th key={r.id} className="py-1 pr-3 font-medium">
                    {r.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schools.map((sc) => (
                <tr key={sc} className="border-t border-line">
                  <td className="py-1.5 pr-3">{sc}</td>
                  {CA_RULES.filter((r) => r.kind === "due").map((r) => {
                    const cs = snapshot.clocks.filter((c) => c.clockId === r.id && (byId.get(c.studentId)?.school ?? "Unknown school") === sc);
                    const over = cs.filter((c) => c.status === "overdue").length;
                    const soon = cs.filter((c) => c.status === "due-soon").length;
                    return (
                      <td key={r.id} className="py-1.5 pr-3">
                        <span className="flex gap-1">
                          {over > 0 && <Badge color="red">{over} overdue</Badge>}
                          {soon > 0 && <Badge color="amber">{soon} soon</Badge>}
                          {!over && !soon && <span className="text-fg-muted">–</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
