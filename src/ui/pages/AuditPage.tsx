import { useState } from "react";
import { auditCsv, download } from "../../audit/export";
import { verifyChain } from "../../audit/log";
import { useStore } from "../../store/store";
import { Badge, Button, inputCls, PageHeader } from "../components";

/** P0-6: every upload, calculation, edit and approval, with time, user and rule. */
export function AuditPage() {
  const audit = useStore((s) => s.audit);
  const log = useStore((s) => s.log);
  const [q, setQ] = useState("");
  const [check, setCheck] = useState<string | null>(null);
  const rows = [...audit].reverse().filter((e) => !q || `${e.summary} ${e.studentId ?? ""} ${e.action} ${e.user}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Append-only. Each entry is chained to the one before it, so any edit to history is detectable."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const r = await verifyChain(audit);
                setCheck(r.ok ? `Verified: all ${audit.length} entries intact.` : `Broken at entry ${r.brokenAt}. History was changed.`);
              }}
            >
              Verify integrity
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                download("audit-log.csv", auditCsv(audit));
                await log({ action: "export", summary: "Exported audit log CSV" });
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />
      {check && <p className="mb-4 text-sm">{check}</p>}
      <input className={`${inputCls} mb-4 max-w-sm`} placeholder="Filter by student, action, text…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto rounded-lg bg-raised shadow-card">
        <table className="w-full text-xs">
          <thead className="border-b border-line bg-sunken text-left text-[11px] tracking-[0.08em] text-fg-muted uppercase">
            <tr>
              {["#", "Time", "User", "Action", "Student", "What happened", "Rule"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, 500).map((e) => (
              <tr key={e.seq}>
                <td className="px-3 py-1.5 text-fg-muted tabular-nums">{e.seq}</td>
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{e.at.replace("T", " ").slice(0, 19)}</td>
                <td className="px-3 py-1.5">{e.user}</td>
                <td className="px-3 py-1.5">
                  <Badge>{e.action}</Badge>
                </td>
                <td className="px-3 py-1.5">{e.studentId ?? ""}</td>
                <td className="px-3 py-1.5">{e.summary}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-fg-muted">{e.rule ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 500 && <p className="p-3 text-xs text-fg-muted">Showing the latest 500 of {rows.length}. Export for the full log.</p>}
      </div>
    </div>
  );
}
