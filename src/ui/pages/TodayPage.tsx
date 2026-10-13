import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { QueueItem } from "../../agent/queue";
import { addDays, fmt, fmtShort } from "../../rules/dates";
import { useStore } from "../../store/store";
import { Badge, Button, cx, DaysLeft, Empty, Field, inputCls, Modal, PageHeader, Working } from "../components";
import { studentLabel, useDerived } from "../useDerived";
import { NotReady } from "./AtRiskPage";

const SEV = { overdue: "Overdue", urgent: "Next 10 days", soon: "Within 30 days", upcoming: "Coming up" } as const;

/** P0-5: one list each morning, sorted by days remaining. */
export function TodayPage() {
  const { queue, byId, ready, today } = useDerived();
  const name = useStore((s) => s.profile.coordinatorName.split(" ")[0]);
  const [done, setDone] = useState<QueueItem | null>(null);
  const [snooze, setSnooze] = useState<QueueItem | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!ready) return <NotReady />;
  const groups = (Object.keys(SEV) as (keyof typeof SEV)[]).map((k) => [k, queue.filter((q) => q.severity === k)] as const).filter(([, v]) => v.length);
  return (
    <div>
      <PageHeader title={`Good morning${name ? `, ${name}` : ""}`} subtitle={`${fmt(today)}. ${queue.length ? `${queue.filter((q) => q.severity !== "upcoming").length} need you in the next 30 days, most urgent first${queue.some((q) => q.severity === "upcoming") ? `, plus ${queue.filter((q) => q.severity === "upcoming").length} coming up` : ""}.` : "Nothing needs you today."}`} />
      {queue.length === 0 && <Empty title="You're all caught up">New deadlines appear here a week before you need to start on them.</Empty>}
      {groups.map(([sev, items]) => (
        <section key={sev} className="mb-8">
          <h2 className={cx("mb-2 text-[11px] font-medium tracking-[0.08em] uppercase", sev === "overdue" ? "text-danger-fg" : sev === "urgent" ? "text-highlight-fg" : "text-fg-muted")}>
            {SEV[sev]} · {items.length}
          </h2>
          <ul className="divide-y divide-line rounded-lg bg-raised shadow-card">
            {items.map((q) => (
              <QueueRow key={q.key} q={q} studentName={studentLabel(byId.get(q.studentId))} open={open === q.key} onToggle={() => setOpen(open === q.key ? null : q.key)} onDone={() => setDone(q)} onSnooze={() => setSnooze(q)} />
            ))}
          </ul>
        </section>
      ))}
      <DoneModal item={done} onClose={() => setDone(null)} />
      <SnoozeModal item={snooze} onClose={() => setSnooze(null)} />
    </div>
  );
}

function QueueRow({ q, studentName, open, onToggle, onDone, onSnooze }: { q: QueueItem; studentName: string; open: boolean; onToggle: () => void; onDone: () => void; onSnooze: () => void }) {
  const nav = useNavigate();
  const start = useStore((s) => s.startMeeting);
  const role = useStore((s) => s.profile.role);
  const primary = (() => {
    switch (q.action) {
      case "schedule":
        return { label: q.meetingId ? "Continue" : "Schedule", run: async () => nav(`/meetings/${q.meetingId ?? (await start(q.result!))}`) };
      case "approve-options":
      case "approve-notice":
        return { label: "Review & approve", run: () => nav(`/meetings/${q.meetingId}`) };
      case "parent-no-reply":
      case "check-reply":
      case "reschedule":
      case "escalated":
        return { label: "Open meeting", run: () => nav(`/meetings/${q.meetingId}`) };
      default:
        return null;
    }
  })();
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="text-sm">
            <span className="font-medium">{q.title}</span>
            <span className="text-fg-muted"> · </span>
            <Link to={`/students/${q.studentId}`} className="hover:underline">
              {studentName}
            </Link>
            {q.escalate && (
              <span className="ml-2">
                <Badge color="red">Escalate</Badge>
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Act by {fmt(q.actionBy)} · <DaysLeft days={q.daysRemaining} />
            {q.schoolDaysRemaining > 0 && ` (${q.schoolDaysRemaining} school days)`} · start by {fmtShort(q.startBy)} · {q.detail}{" "}
            {q.result && (
              <button className="underline decoration-dotted" onClick={onToggle}>
                {open ? "hide working" : "why this date?"}
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {primary && (
            <Button size="sm" variant="primary" onClick={primary.run} disabled={role === "viewer" && q.action !== "check-reply"}>
              {primary.label}
            </Button>
          )}
          {!q.meetingId && (
            <Button size="sm" onClick={onDone} disabled={role === "viewer"}>
              Done
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onSnooze} disabled={role === "viewer"}>
            Snooze
          </Button>
        </div>
      </div>
      {open && q.result && (
        <div className="mt-2">
          <Working r={q.result} />
        </div>
      )}
    </li>
  );
}

function DoneModal({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const today = useStore((s) => s.today)();
  const mark = useStore((s) => s.markTask);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  if (!item) return null;
  const label: Record<string, string> = {
    planSent: "Date the assessment plan was given to the parent",
    consent: "Date the signed plan came back",
    evalMeetingHeld: "Date the IEP meeting was held",
    parentRequestMeetingHeld: "Date the meeting was held",
    lastAnnual: "Date the annual IEP was held",
    lastTriennial: "Date the triennial IEP was held",
  };
  return (
    <Modal open onClose={onClose} title={`Done: ${item.title}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await mark(item.key, { status: "done", reason: note }, item.doneField ? { studentId: item.studentId, field: item.doneField, date, clockId: item.clockId } : undefined);
          onClose();
        }}
      >
        {item.doneField && (
          <Field label={label[item.doneField] ?? "Date"} hint="This updates the student's record and every clock that depends on it.">
            <input type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        <Field label="Note (optional)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={item.action === "follow-up-plan" ? "e.g. parent declined in writing" : ""} />
        </Field>
        <Button variant="primary" type="submit">
          Mark done
        </Button>
      </form>
    </Modal>
  );
}

function SnoozeModal({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  const today = useStore((s) => s.today)();
  const mark = useStore((s) => s.markTask);
  const [until, setUntil] = useState(addDays(today, 3));
  const [reason, setReason] = useState("");
  if (!item) return null;
  return (
    <Modal open onClose={onClose} title={`Snooze: ${item.title}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await mark(item.key, { status: "snoozed", until, reason });
          onClose();
        }}
      >
        <Field label="Until">
          <input type="date" required min={addDays(today, 1)} className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Field label="Reason" hint="Required. It goes in the audit log.">
          <input required className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. waiting on psych report" />
        </Field>
        {until > item.actionBy && <p className="text-sm text-highlight-fg">That's after the act-by date ({fmt(item.actionBy)}).</p>}
        <Button variant="primary" type="submit">
          Snooze
        </Button>
      </form>
    </Modal>
  );
}
