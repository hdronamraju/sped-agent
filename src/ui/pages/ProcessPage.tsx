import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { STAGES, studentStage, type StageId, type StudentStage } from "../../agent/stages";
import { fmtShort } from "../../rules/dates";
import { useStore } from "../../store/store";
import type { Student } from "../../types";
import { Badge, cx, DaysLeft, inputCls, PageHeader } from "../components";
import { studentLabel, useDerived } from "../useDerived";
import { NotReady } from "./AtRiskPage";

/** Where each student is in the IEP process, one column per stage. */
export function ProcessPage() {
  const { snapshot, byId, atRisk, ready, today } = useDerived();
  const meetings = useStore((s) => s.meetings);
  const [school, setSchool] = useState("");
  const [cm, setCm] = useState("");

  const students = [...byId.values()];
  const schools = [...new Set(students.map((s) => s.school).filter((x): x is string => !!x))].sort();
  const managers = [...new Set(students.map((s) => s.caseManager).filter((x): x is string => !!x))].sort();

  const columns = useMemo(() => {
    const cols = new Map<StageId, { student: Student; st: StudentStage }[]>(STAGES.map((s) => [s.id, []]));
    for (const s of byId.values()) {
      if (school && s.school !== school) continue;
      if (cm && s.caseManager !== cm) continue;
      const st = studentStage(s, snapshot.byStudent.get(s.id) ?? [], meetings, today, { trackerLoaded: atRisk.trackerLoaded });
      cols.get(st.stage)!.push({ student: s, st });
    }
    // Most urgent first in every column.
    for (const list of cols.values()) list.sort((a, b) => (a.st.next?.daysRemaining ?? 9999) - (b.st.next?.daysRemaining ?? 9999));
    return cols;
  }, [byId, snapshot, meetings, today, atRisk.trackerLoaded, school, cm]);

  if (!ready) return <NotReady />;
  return (
    <div>
      <PageHeader
        title="Process"
        subtitle="Where every student is, from referral to an active IEP. Cards are sorted by their next deadline."
        action={
          <div className="flex flex-wrap gap-2">
            <select aria-label="School" className={cx(inputCls, "w-auto")} value={school} onChange={(e) => setSchool(e.target.value)}>
              <option value="">All schools</option>
              {schools.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select aria-label="Case manager" className={cx(inputCls, "w-auto")} value={cm} onChange={(e) => setCm(e.target.value)}>
              <option value="">All case managers</option>
              {managers.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        }
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-10 md:px-10">
        <div className="grid auto-cols-[minmax(232px,1fr)] grid-flow-col items-start gap-3 max-md:auto-cols-auto max-md:grid-flow-row">
          {STAGES.map((stage) => {
            const list = columns.get(stage.id)!;
            if (stage.id === "info" && list.length === 0) return null;
            return (
              <section key={stage.id} aria-label={stage.label} className="flex min-w-0 flex-col rounded-lg bg-sunken p-2">
                <header className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-2" title={stage.hint}>
                  <h2 className="text-[11px] font-medium tracking-[0.08em] text-fg-subtle uppercase">{stage.label}</h2>
                  <span className="font-mono text-[11px] text-fg-muted tabular-nums">{list.length}</span>
                </header>
                <ul className="flex flex-col gap-2">
                  {list.length === 0 && <li className="px-2 py-3 text-xs text-fg-muted">No students</li>}
                  {list.map(({ student, st }) => (
                    <li key={student.id}>
                      <StudentCard student={student} st={st} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StudentCard({ student, st }: { student: Student; st: StudentStage }) {
  return (
    <Link
      to={`/students/${student.id}`}
      className="block rounded-md bg-raised px-3 py-2.5 shadow-card transition-colors hover:bg-hover"
      data-testid={`card-${student.id}`}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13.5px] font-medium">{studentLabel(student)}</span>
        <span className="shrink-0 font-mono text-[11px] text-fg-muted">#{student.id}</span>
      </p>
      {st.next ? (
        <p className="mt-1 text-xs text-fg-subtle">
          {st.next.label}: {fmtShort(st.next.actionBy)} · <DaysLeft days={st.next.daysRemaining} />
        </p>
      ) : (
        <p className="mt-1 text-xs text-fg-muted">No open deadlines</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {st.daysInStage !== undefined && <span className="mr-1 font-mono text-[11px] text-fg-muted">{st.daysInStage}d in stage</span>}
        {st.flags.overdue && <Badge color="red">Overdue</Badge>}
        {st.flags.interpreter && <Badge color="gray">{student.parentLanguage}</Badge>}
        {st.flags.notOnTracker && <Badge color="amber">Not on tracker</Badge>}
        {st.flags.noParentEmail && <Badge color="gray">No parent email</Badge>}
      </div>
    </Link>
  );
}
