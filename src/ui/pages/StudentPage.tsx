import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RULES_BY_ID, type ClockId } from "../../rules/ca-rules";
import { isOpen, type ClockResult } from "../../rules/engine";
import { download, studentTimelineCsv, studentTimelinePdf } from "../../audit/export";
import { useStore } from "../../store/store";
import { DATE_FIELDS, EXCEPTION_LABELS, type ExceptionKind, type StudentDateField } from "../../types";
import { Badge, Button, Card, cx, DateText, DaysLeft, Field, inputCls, Modal, PageHeader, StatusBadge, Working } from "../components";
import { useDerived } from "../useDerived";
import { MEETING_TYPE_LABELS } from "../../agent/model";
import { EVAL_STEPS, stageOf, studentStage } from "../../agent/stages";


export function StudentPage() {
  const { id = "" } = useParams();
  const { snapshot, byId, today, atRisk } = useDerived();
  const trackerLoaded = atRisk.trackerLoaded;
  const s = byId.get(id);
  const audit = useStore((st) => st.audit);
  // Select the stable array and filter outside the selector; a selector that
  // returns a new array on every call makes React re-render forever.
  const allMeetings = useStore((st) => st.meetings);
  const meetings = useMemo(() => allMeetings.filter((m) => m.studentId === id), [allMeetings, id]);
  const district = useStore((st) => st.profile.district);
  const editDate = useStore((st) => st.editDate);
  const updateStudent = (patch: Record<string, string>) =>
    useStore.getState().set({ students: useStore.getState().students.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const log = useStore((st) => st.log);
  const start = useStore((st) => st.startMeeting);
  const role = useStore((st) => st.profile.role);
  const nav = useNavigate();
  const [exceptionFor, setExceptionFor] = useState<ClockResult | null>(null);
  if (!s) return <p className="text-fg-muted">Student not found.</p>;
  const clocks = snapshot.byStudent.get(id) ?? [];
  const entries = audit.filter((e) => e.studentId === id);
  const stage = studentStage(s, clocks, meetings, today, { trackerLoaded });

  return (
    <div>
      <PageHeader
        title={s.name ?? `Student ${s.id}`}
        subtitle={[`#${s.id}`, s.school, s.grade && `Grade ${s.grade}`, s.caseManager && `Case manager: ${s.caseManager}`, s.disability].filter(Boolean).join(" · ")}
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                download(`timeline-${s.id}.pdf`, await studentTimelinePdf(s, clocks, audit, district));
                await log({ action: "export", studentId: s.id, summary: "Exported timeline PDF" });
              }}
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                download(`timeline-${s.id}.csv`, studentTimelineCsv(s, clocks, audit));
                await log({ action: "export", studentId: s.id, summary: "Exported timeline CSV" });
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />
      <StageStepper stage={stage.stage} daysInStage={stage.daysInStage} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {clocks.length === 0 && <p className="text-sm text-fg-muted">No clocks apply yet. Add a referral, consent or IEP date.</p>}
          {clocks.map((r) => (
            <Card
              key={r.clockId}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {r.label} <StatusBadge status={r.status} />
                  {r.provisional && <Badge color="amber">estimated</Badge>}
                </span>
              }
              subtitle={
                <>
                  Due <DateText d={r.dueDate} />
                  {r.actionBy !== r.dueDate && (
                    <>
                      {" "}
                      · act by <DateText d={r.actionBy} />
                    </>
                  )}
                  {isOpen(r) && (
                    <>
                      {" "}
                      · <DaysLeft days={r.daysRemaining} />
                    </>
                  )}
                </>
              }
              action={
                <div className="flex gap-1.5">
                  {isOpen(r) && ["eval-meeting", "parent-request-meeting", "annual", "triennial"].includes(r.clockId) && (
                    <Button size="sm" variant="primary" disabled={role === "viewer"} onClick={async () => nav(`/meetings/${await start(r)}`)}>
                      Schedule
                    </Button>
                  )}
                  {RULES_BY_ID[r.clockId].allowedExceptions.length > 0 && (
                    <Button size="sm" variant="ghost" disabled={role === "viewer"} onClick={() => setExceptionFor(r)}>
                      Record exception
                    </Button>
                  )}
                </div>
              }
            >
              <Working r={r} />
            </Card>
          ))}
          <Card title="History" subtitle="Every upload, calculation, edit, approval and message for this student.">
            {entries.length === 0 ? (
              <p className="text-sm text-fg-muted">Nothing yet.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {[...entries].reverse().map((e) => (
                  <li key={e.seq} className="flex gap-3">
                    <span className="w-32 shrink-0 text-fg-muted tabular-nums">{e.at.replace("T", " ").slice(0, 16)}</span>
                    <span className="w-20 shrink-0 text-fg-muted">{e.user === "agent" ? "agent" : e.user.split("@")[0]}</span>
                    <span>
                      {e.summary}
                      {e.rule && <span className="text-fg-muted"> [{e.rule}]</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Dates">
            <div className="space-y-2">
              {DATE_FIELDS.map((f) => (
                <DateRow key={f.key} label={f.label} value={s.dates[f.key]} disabled={role === "viewer"} onSave={(v, why) => editDate(s.id, f.key as StudentDateField, v || undefined, why)} />
              ))}
            </div>
          </Card>
          <Card title="Family">
            <div className="space-y-2">
              {(
                [
                  ["parentName", "Parent name"],
                  ["parentEmail", "Parent email"],
                  ["parentPhone", "Parent phone"],
                  ["parentLanguage", "Home language"],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    className={inputCls}
                    defaultValue={s[k] ?? ""}
                    disabled={role === "viewer"}
                    onBlur={async (e) => {
                      if (e.target.value !== (s[k] ?? "")) {
                        updateStudent({ [k]: e.target.value });
                        await log({ action: "date-edited", studentId: s.id, summary: `${label} updated` });
                      }
                    }}
                  />
                </Field>
              ))}
              <Field label="Current evaluation">
                <select className={inputCls} value={s.evalType ?? "initial"} disabled={role === "viewer"} onChange={(e) => updateStudent({ evalType: e.target.value })}>
                  <option value="initial">Initial</option>
                  <option value="triennial">Triennial</option>
                </select>
              </Field>
            </div>
          </Card>
          {meetings.length > 0 && (
            <Card title="Meetings">
              <ul className="space-y-1 text-sm">
                {meetings.map((m) => (
                  <li key={m.id}>
                    <Link className="text-accent hover:underline" to={`/meetings/${m.id}`}>
                      {MEETING_TYPE_LABELS[m.type]}
                    </Link>{" "}
                    <span className="text-fg-muted">· {m.status.replace("-", " ")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <ExceptionModal r={exceptionFor} studentId={s.id} onClose={() => setExceptionFor(null)} />
    </div>
  );
}

function DateRow({ label, value, onSave, disabled }: { label: string; value?: string; onSave: (v: string, why: string) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  const [why, setWhy] = useState("");
  if (!editing)
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-muted">{label}</span>
        <button disabled={disabled} className="tabular-nums hover:underline disabled:no-underline" onClick={() => setEditing(true)}>
          {value ?? <span className="text-fg-muted">add</span>}
        </button>
      </div>
    );
  return (
    <form
      className="space-y-1.5 rounded-lg bg-sunken p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v, why);
        setEditing(false);
      }}
    >
      <p className="text-xs font-medium">{label}</p>
      <input type="date" className={inputCls} value={v} onChange={(e) => setV(e.target.value)} />
      <input className={inputCls} placeholder="Why? (goes in the audit log)" value={why} onChange={(e) => setWhy(e.target.value)} required />
      <div className="flex gap-1">
        <Button size="sm" variant="primary" type="submit">
          Save
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ExceptionModal({ r, studentId, onClose }: { r: ClockResult | null; studentId: string; onClose: () => void }) {
  const add = useStore((s) => s.addException);
  const [kind, setKind] = useState<ExceptionKind>("parent-extension");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [doc, setDoc] = useState("");
  if (!r) return null;
  const allowed = RULES_BY_ID[r.clockId as ClockId].allowedExceptions;
  const needsDate = kind !== "parent-not-producing";
  return (
    <Modal open onClose={onClose} title={`Exception: ${r.label}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await add(studentId, { clockId: r.clockId, kind, agreedDate: needsDate ? date : undefined, note, documentRef: doc || undefined });
          onClose();
        }}
      >
        <Field label="Kind">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as ExceptionKind)}>
            {allowed.map((k) => (
              <option key={k} value={k}>
                {EXCEPTION_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        {needsDate && (
          <Field label="Agreed date">
            <input type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        <Field label="What happened" hint="Recorded with your name and the time.">
          <textarea required className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Where the written record is (optional)">
          <input className={inputCls} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="e.g. signed extension in cum file, 12/3" />
        </Field>
        <Button variant="primary" type="submit">
          Record exception
        </Button>
      </form>
    </Modal>
  );
}


/** Where this student is in the IEP process. */
function StageStepper({ stage, daysInStage }: { stage: ReturnType<typeof studentStage>["stage"]; daysInStage?: number }) {
  const current = stageOf(stage);
  // Off-path stages (review due, needs info) sit after an active IEP.
  const steps = EVAL_STEPS.includes(stage) ? EVAL_STEPS : [...EVAL_STEPS.slice(0, -1), "active" as const, stage];
  const at = steps.indexOf(stage);
  return (
    <nav aria-label="Process stage" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {steps.map((id, i) => (
          <li
            key={id}
            aria-current={i === at ? "step" : undefined}
            className={cx(
              "rounded-full px-3 py-1",
              i === at ? "bg-raised font-medium text-fg shadow-card" : i < at ? "bg-accent-soft text-accent-soft-fg" : "bg-sunken text-fg-muted",
            )}
          >
            {stageOf(id).label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-fg-muted">
        {current.hint}
        {daysInStage !== undefined && ` · ${daysInStage} days in this stage`} ·{" "}
        <Link className="text-accent hover:underline" to="/process">
          See everyone
        </Link>
      </p>
    </nav>
  );
}
