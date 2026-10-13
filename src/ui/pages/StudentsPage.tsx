import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, DaysLeft, inputCls, PageHeader, StatusBadge } from "../components";
import { useDerived } from "../useDerived";
import { isOpen } from "../../rules/engine";
import { NotReady } from "./AtRiskPage";

export function StudentsPage() {
  const { snapshot, byId, ready } = useDerived();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    return [...byId.values()]
      .map((s) => {
        const clocks = snapshot.byStudent.get(s.id) ?? [];
        const next = clocks.filter(isOpen).sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
        return { s, next };
      })
      .filter(({ s }) => !q || `${s.id} ${s.name ?? ""} ${s.school ?? ""} ${s.caseManager ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (a.next?.daysRemaining ?? 9999) - (b.next?.daysRemaining ?? 9999));
  }, [byId, snapshot, q]);
  if (!ready) return <NotReady />;
  return (
    <div>
      <PageHeader title="Students" subtitle={`${byId.size} students. Sorted by the next deadline.`} action={<input className={`${inputCls} w-64`} placeholder="Search ID, name, school…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="overflow-x-auto rounded-lg bg-raised shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-sunken text-left text-[11px] tracking-[0.08em] text-fg-muted uppercase">
            <tr>
              {["Student", "School", "Case manager", "Next deadline", "", "Language", "Source"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ s, next }) => (
              <tr key={s.id} className="hover:bg-hover">
                <td className="px-4 py-2">
                  <Link to={`/students/${s.id}`} className="font-medium hover:underline">
                    {s.name ?? `Student ${s.id}`}
                  </Link>
                  <span className="ml-1 font-mono text-xs text-fg-muted">#{s.id}</span>
                </td>
                <td className="px-4 py-2 text-fg-muted">{s.school ?? "–"}</td>
                <td className="px-4 py-2 text-fg-muted">{s.caseManager ?? "–"}</td>
                <td className="px-4 py-2">{next ? `${next.label}, ${next.actionBy}` : <span className="text-fg-muted">none open</span>}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {next && (
                    <span className="flex items-center gap-2">
                      <StatusBadge status={next.status} /> <DaysLeft days={next.daysRemaining} />
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-fg-muted">{s.parentLanguage ?? "–"}</td>
                <td className="px-4 py-2">
                  <span className="flex gap-1">
                    {s.inSeis && <Badge>SEIS</Badge>}
                    {s.onTracker && <Badge color="blue">tracker</Badge>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
