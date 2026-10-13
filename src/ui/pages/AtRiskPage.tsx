import { useState } from "react";
import { Link } from "react-router-dom";
import type { ClockResult } from "../../rules/engine";
import { Badge, Card, DateText, DaysLeft, Empty, PageHeader, Stat, StatusBadge, Working } from "../components";
import { studentLabel, useDerived } from "../useDerived";

/** P0-4: who is overdue or close, and who isn't on the coordinator's tracker. */
export function AtRiskPage() {
  const { atRisk, byId, ready } = useDerived();
  if (!ready) return <NotReady />;
  return (
    <div>
      <PageHeader title="At-risk list" subtitle="Every legal deadline that has passed or falls in the next 30 days. Click a row to see how the date was counted." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Overdue" value={atRisk.overdue.length} tone={atRisk.overdue.length ? "red" : "default"} />
        <Stat label="Due within 30 days" value={atRisk.dueSoon.length} tone={atRisk.dueSoon.length ? "amber" : "default"} />
        <Stat label="Not on your tracker" value={atRisk.trackerLoaded ? atRisk.notOnTracker.length : "–"} tone="violet" />
      </div>
      {atRisk.trackerLoaded && atRisk.notOnTracker.length > 0 && (
        <Card className="mb-6 border-highlight" title="Found students you weren't tracking" subtitle="They're in SEIS with a deadline coming or passed, but not in your tracking spreadsheet.">
          <ul className="divide-y divide-line">
            {atRisk.notOnTracker.map(({ student, results }) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link to={`/students/${student.id}`} className="font-medium hover:underline">
                  {studentLabel(student)} <span className="font-mono text-xs font-normal text-fg-muted">#{student.id}</span>
                </Link>
                <span className="flex gap-2">
                  {results.map((r) => (
                    <Badge key={r.clockId} color={r.status === "overdue" ? "red" : "amber"}>
                      {r.label}: {r.status === "overdue" ? "overdue" : `due ${r.dueDate}`}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Group title="Overdue" items={atRisk.overdue} byId={byId} empty="Nothing overdue." />
      <Group title="Due within 30 days" items={atRisk.dueSoon} byId={byId} empty="Nothing due in the next 30 days." />
    </div>
  );
}

function Group({ title, items, byId, empty }: { title: string; items: ClockResult[]; byId: Map<string, { id: string; name?: string; school?: string }>; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="mb-6" title={`${title} (${items.length})`}>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {items.map((r) => {
            const k = `${r.studentId}:${r.clockId}`;
            const s = byId.get(r.studentId);
            return (
              <li key={k} className="py-2">
                <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left text-sm" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                  <span className="w-48 shrink-0">
                    <span className="font-medium">{studentLabel(s)}</span>
                    <span className="ml-1 font-mono text-xs text-fg-muted">#{r.studentId}</span>
                  </span>
                  <span className="w-48 shrink-0">{r.label}</span>
                  <span className="w-40 shrink-0">
                    Due <DateText d={r.dueDate} />
                  </span>
                  <span className="w-28 shrink-0">
                    <DaysLeft days={r.daysRemaining} />
                  </span>
                  <StatusBadge status={r.status} />
                  {r.skipped.length > 0 && <Badge color="violet">skipped {r.skipped.length} break{r.skipped.length > 1 ? "s" : ""}</Badge>}
                  {r.warnings.length > 0 && <Badge color="amber">check</Badge>}
                  <span className="ml-auto text-xs text-fg-muted">{open === k ? "Hide working" : "Show working"}</span>
                </button>
                {open === k && (
                  <div className="mt-2">
                    <Working r={r} />
                    <Link to={`/students/${r.studentId}`} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
                      Open student →
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function NotReady() {
  return (
    <Empty title="Upload students and a school calendar to see deadlines">
      <Link className="text-accent underline" to="/data">
        Upload data
      </Link>{" "}
      ·{" "}
      <Link className="text-accent underline" to="/calendar">
        School calendar
      </Link>
    </Empty>
  );
}
