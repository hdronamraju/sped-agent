import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { missingAttendees } from "../../agent/attendees";
import { templateLanguage } from "../../agent/language";
import { MEETING_TYPE_LABELS, STAFF_ROLE_LABELS, type Attendee, type Meeting, type OutboundMessage, type StaffRole } from "../../agent/model";
import { checkNotice } from "../../agent/notices";
import { fmtTime } from "../../agent/time";
import { simulateDecline, simulateParentReply } from "../../integrations/demo";
import { fmt } from "../../rules/dates";
import { useStore } from "../../store/store";
import { Badge, Button, Card, cx, DateText, Field, inputCls, PageHeader } from "../components";
import { studentLabel, useDerived } from "../useDerived";

const STEPS: { key: Meeting["status"][]; label: string }[] = [
  { key: ["planning"], label: "Attendees" },
  { key: ["options-ready"], label: "Approve times" },
  { key: ["awaiting-parent"], label: "Parent picks" },
  { key: ["notice-draft"], label: "Approve notice" },
  { key: ["scheduled", "held"], label: "Scheduled" },
];

export function MeetingPage() {
  const { id = "" } = useParams();
  const m = useStore((s) => s.meetings.find((x) => x.id === id));
  const { byId, snapshot } = useDerived();
  const conn = useStore((s) => s.connection);
  const st = useStore();
  if (!m) return <p className="text-fg-muted">Meeting not found.</p>;
  const s = byId.get(m.studentId)!;
  const clock = snapshot.clocks.find((c) => c.studentId === m.studentId && c.clockId === m.clockId);
  const stepIdx = STEPS.findIndex((x) => x.key.includes(m.status));
  const drafts = m.messages.filter((x) => x.status === "draft");
  const sent = m.messages.filter((x) => x.status !== "draft");
  const viewer = st.profile.role === "viewer";
  const missing = missingAttendees(m.attendees);

  return (
    <div>
      <PageHeader
        title={`${MEETING_TYPE_LABELS[m.type]}: ${studentLabel(s)}`}
        subtitle={
          <>
            Must be held by <b>{fmt(m.deadline)}</b>
            {clock && clock.dueDate !== m.deadline && <> (legal date {fmt(clock.dueDate)})</>}. Aiming for {fmt(m.latestAllowed)} or earlier to leave a buffer.{" "}
            <Link className="text-accent hover:underline" to={`/students/${s.id}`}>
              Student #{s.id}
            </Link>
          </>
        }
        action={
          !["held", "cancelled"].includes(m.status) && (
            <Button size="sm" variant="ghost" disabled={viewer} onClick={() => st.cancelMeeting(m.id, prompt("Why cancel scheduling?") || "no reason given")}>
              Cancel scheduling
            </Button>
          )
        }
      />
      {m.status !== "escalated" && m.status !== "needs-reschedule" && m.status !== "cancelled" && (
        <ol className="mb-6 flex flex-wrap gap-2 text-xs">
          {STEPS.map((x, i) => (
            <li key={x.label} className={cx("rounded-full px-3 py-1", i === stepIdx ? "bg-raised font-medium text-fg shadow-card" : i < stepIdx ? "bg-accent-soft text-accent-soft-fg" : "bg-sunken text-fg-muted")}>
              {i + 1}. {x.label}
            </li>
          ))}
        </ol>
      )}
      {!conn && (
        <p className="mb-4 rounded-lg bg-highlight px-4 py-3 text-sm text-highlight-fg">
          Connect a calendar first (or use demo calendars) on{" "}
          <Link className="underline" to="/connections">
            Calendar & email
          </Link>
          .
        </p>
      )}
      {m.status === "escalated" && <Escalation m={m} />}
      {m.status === "needs-reschedule" && (
        <Card className="mb-6 border-highlight" title="Needs a new time" subtitle="Someone declined or the parent can't make any option. New times must still meet the deadline.">
          <Button variant="primary" disabled={!conn || viewer} onClick={() => st.findTimes(m.id).catch(() => {})}>
            Find new times
          </Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {m.status === "planning" && (
            <Card title="Ready to find times?" subtitle="The agent checks everyone's calendar and finds three times on different days, all before the deadline.">
              {missing.length > 0 && <p className="mb-3 text-sm text-highlight-fg">Not assigned yet: {missing.map((a) => STAFF_ROLE_LABELS[a.role as StaffRole]).join(", ")}. Add them on the right, or find times without them.</p>}
              <Button variant="primary" disabled={!conn || viewer} onClick={() => st.findTimes(m.id).catch(() => {})}>
                Find 3 times
              </Button>
            </Card>
          )}
          {m.options.length > 0 && (
            <Card title="Times offered" subtitle={m.escalationReason}>
              <ol className="space-y-1.5 text-sm">
                {m.options.map((o, i) => (
                  <li key={i} className={cx("flex items-center justify-between rounded-lg px-3 py-2", m.chosen?.date === o.date && m.chosen.start === o.start ? "bg-accent-soft ring-1 ring-accent-soft" : "bg-sunken")}>
                    <span>
                      <b>{i + 1})</b> {fmt(o.date)}, {fmtTime(o.start)} – {fmtTime(o.end)}
                    </span>
                    {m.status === "awaiting-parent" && (
                      <Button size="sm" variant="ghost" disabled={viewer} onClick={() => st.choose(m.id, i, "coordinator entered the parent's choice").catch((e) => useStore.setState({ error: e instanceof Error ? e.message : String(e) }))}>
                        Parent chose this
                      </Button>
                    )}
                    {m.chosen?.date === o.date && m.chosen.start === o.start && <Badge color="green">chosen</Badge>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {drafts.map((d) => (
            <DraftCard key={d.id} m={m} msg={d} />
          ))}
          {m.status === "awaiting-parent" && <AwaitingParent m={m} />}
          {(m.status === "scheduled" || m.status === "held") && <Scheduled m={m} />}
          {sent.length > 0 && (
            <Card title="Messages">
              <ul className="space-y-3 text-sm">
                {sent.map((x) => (
                  <li key={x.id}>
                    <p className="font-medium">
                      {x.subject}{" "}
                      <Badge color={x.status === "sent" ? "green" : "red"}>{x.status}</Badge>
                    </p>
                    <p className="text-xs text-fg-muted">
                      To {x.to.join(", ")} · approved by {x.approvedBy} {x.approvedAt && new Date(x.approvedAt).toLocaleString()}
                      {x.sentAt && ` · sent ${new Date(x.sentAt).toLocaleString()}`}
                      {x.error && ` · ${x.error}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <AttendeesCard m={m} disabled={viewer} />
          <Card title="Where">
            <input className={inputCls} defaultValue={m.location} disabled={viewer} onBlur={(e) => st.updateMeeting(m.id, { location: e.target.value })} aria-label="Location" />
            <p className="mt-2 text-xs text-fg-muted">Parent's language: {m.parentLanguage}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AttendeesCard({ m, disabled }: { m: Meeting; disabled: boolean }) {
  const staff = useStore((s) => s.staff);
  const setAttendees = useStore((s) => s.setAttendees);
  const [adding, setAdding] = useState("");
  const editable = ["planning", "options-ready", "needs-reschedule", "escalated"].includes(m.status) && !disabled;
  const swap = (a: Attendee, staffId: string) => {
    const p = staff.find((x) => x.id === staffId);
    if (!p) return;
    setAttendees(m.id, m.attendees.map((x) => (x.key === a.key ? { ...x, name: p.name, email: p.email, staffId: p.id } : x)));
  };
  return (
    <Card title="Required attendees" subtitle="From California's IEP team rules. Add or swap people as needed.">
      <ul className="space-y-3 text-sm">
        {m.attendees.map((a) => (
          <li key={a.key}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {a.name}
                  {a.response === "declined" && (
                    <span className="ml-1">
                      <Badge color="red">declined</Badge>
                    </span>
                  )}
                  {a.response === "accepted" && (
                    <span className="ml-1">
                      <Badge color="green">accepted</Badge>
                    </span>
                  )}
                </p>
                <p className="text-xs text-fg-muted">{a.role === "parent" ? "Parent/guardian" : STAFF_ROLE_LABELS[a.role]}</p>
                <p className="text-[11px] text-fg-muted">{a.reason}</p>
                {!a.email && a.role !== "parent" && <p className="text-xs text-highlight-fg">No one assigned</p>}
              </div>
              {editable && a.role !== "parent" && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <select aria-label={`Swap ${a.name}`} className="max-w-36 rounded border border-line px-1 py-0.5 text-xs" value={a.staffId ?? ""} onChange={(e) => swap(a, e.target.value)}>
                    <option value="">Swap…</option>
                    {staff
                      .filter((p) => p.role === a.role)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  {!a.required && (
                    <button className="text-xs text-fg-muted hover:text-danger" onClick={() => setAttendees(m.id, m.attendees.filter((x) => x.key !== a.key))}>
                      remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="mt-4 flex gap-2 border-t border-line pt-3">
          <select aria-label="Add attendee" className={cx(inputCls, "py-1 text-xs")} value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add someone (e.g. speech therapist)…</option>
            {staff
              .filter((p) => !m.attendees.some((a) => a.staffId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({STAFF_ROLE_LABELS[p.role]})
                </option>
              ))}
          </select>
          <Button
            size="sm"
            disabled={!adding}
            onClick={() => {
              const p = staff.find((x) => x.id === adding)!;
              setAttendees(m.id, [...m.attendees, { key: `extra-${p.id}`, role: p.role, name: p.name, email: p.email, staffId: p.id, required: false, reason: "Added by coordinator" }]);
              setAdding("");
            }}
          >
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}

function DraftCard({ m, msg }: { m: Meeting; msg: OutboundMessage }) {
  const st = useStore();
  const s = st.students.find((x) => x.id === m.studentId)!;
  const { snapshot } = useDerived();
  const legal = snapshot.clocks.find((c) => c.studentId === m.studentId && c.clockId === m.clockId)?.dueDate ?? m.deadline;
  const isNotice = msg.kind === "notice" || msg.kind === "notice-update";
  const checks = isNotice ? checkNotice(m, s, msg.body, msg.language, legal) : [];
  const blocked = checks.some((c) => !c.ok);
  const needsTranslation = templateLanguage(m.parentLanguage) === null && msg.language.toLowerCase() !== m.parentLanguage.toLowerCase();
  const [translating, setTranslating] = useState(false);
  const viewer = st.profile.role === "viewer";

  return (
    <Card
      className="border-accent-soft ring-1 ring-accent-soft"
      title={isNotice ? (msg.kind === "notice-update" ? "Updated meeting notice: needs your approval" : "Meeting notice: needs your approval") : "Message to parent: needs your approval"}
      subtitle={`To ${msg.to.join(", ") || "(no parent email on file)"} · ${msg.language === "es" ? "Spanish" : msg.language === "en" ? "English" : msg.language}. Nothing is sent until you approve.`}
    >
      <div className="space-y-2">
        <input className={inputCls} value={msg.subject} disabled={viewer} onChange={(e) => st.editMessage(m.id, msg.id, { subject: e.target.value })} aria-label="Subject" />
        <textarea className={cx(inputCls, "font-mono text-xs leading-relaxed")} rows={14} value={msg.body} disabled={viewer} onChange={(e) => st.editMessage(m.id, msg.id, { body: e.target.value })} aria-label="Message body" />
      </div>
      {needsTranslation && (
        <div className="mt-3 rounded-lg bg-highlight px-3 py-2 text-sm text-highlight-fg">
          There's no built-in {m.parentLanguage} template. Translate it before sending:{" "}
          {st.settings.aiEnabled && st.settings.anthropicKey ? (
            <Button
              size="sm"
              disabled={translating || viewer}
              onClick={async () => {
                setTranslating(true);
                try {
                  const { translate } = await import("../../ai/claude");
                  const t = await translate(st.settings.anthropicKey!, `${msg.subject}\n\n${msg.body}`, m.parentLanguage);
                  await st.editMessage(m.id, msg.id, { subject: t.subject, body: t.body, language: m.parentLanguage });
                  await st.log({ action: "message-approved", studentId: m.studentId, summary: `AI draft translation to ${m.parentLanguage} (needs human review before approval)` });
                } catch (e) {
                  useStore.setState({ error: e instanceof Error ? e.message : String(e) });
                } finally {
                  setTranslating(false);
                }
              }}
            >
              {translating ? "Translating…" : `Draft ${m.parentLanguage} translation with AI`}
            </Button>
          ) : (
            <>
              paste the district translator's version above, then{" "}
              <button className="underline" disabled={viewer} onClick={() => st.editMessage(m.id, msg.id, { language: m.parentLanguage })}>
                mark it as {m.parentLanguage}
              </button>
              .
            </>
          )}
        </div>
      )}
      {isNotice && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-fg-subtle">Required content check</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.id} className={c.ok ? "text-accent" : "text-danger-fg"} title={c.detail}>
                {c.ok ? "✓" : "✗"} {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="primary" disabled={blocked || !msg.to.length || viewer || (!isNotice && needsTranslation)} onClick={() => st.approveAndSend(m.id, msg.id).catch(() => {})}>
          Approve & send
        </Button>
        {blocked && <span className="text-xs text-danger-fg">Fix the items marked ✗ to approve.</span>}
        {!msg.to.length && <span className="text-xs text-danger-fg">Add the parent's email on the student page.</span>}
        {viewer && <span className="text-xs text-fg-muted">Viewers can't approve.</span>}
      </div>
    </Card>
  );
}

function AwaitingParent({ m }: { m: Meeting }) {
  const st = useStore();
  const [reply, setReply] = useState("");
  const thread = [...m.messages].reverse().find((x) => x.kind === "parent-options" && x.threadId)?.threadId;
  const s = st.students.find((x) => x.id === m.studentId)!;
  return (
    <Card title="Waiting on the parent" subtitle={`Sent ${m.lastParentContactAt ? new Date(m.lastParentContactAt).toLocaleString() : ""}. The agent reads replies in the same email thread.`}>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => st.checkParent(m.id).catch(() => {})}>
          Check for reply
        </Button>
      </div>
      {m.parentReplies.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {m.parentReplies.map((r, i) => (
            <li key={i} className="rounded-lg bg-sunken p-3">
              <p className="whitespace-pre-wrap">"{r.body.trim()}"</p>
              <p className="mt-1 text-xs text-fg-muted">
                {new Date(r.at).toLocaleString()} · {r.parsed}
              </p>
            </li>
          ))}
        </ul>
      )}
      {st.connection?.kind === "demo" && thread && (
        <div className="mt-4 rounded-lg border border-dashed border-line-strong p-3">
          <p className="mb-2 text-xs font-medium text-fg-muted">Demo: pretend the parent replied</p>
          <div className="flex gap-2">
            <input className={inputCls} placeholder={m.parentLanguage === "Spanish" ? 'e.g. "La 2 por favor"' : 'e.g. "2 works for me"'} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Simulated parent reply" />
            <Button
              disabled={!reply}
              onClick={async () => {
                st.mutateDemo((d) => simulateParentReply(d, thread, s.parentEmail ?? "parent@example.com", reply));
                setReply("");
                await useStore.getState().checkParent(m.id).catch(() => {});
              }}
            >
              Simulate reply
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Scheduled({ m }: { m: Meeting }) {
  const st = useStore();
  const today = st.today();
  const [held, setHeld] = useState(m.chosen?.date ?? today);
  const staffAttendee = m.attendees.find((a) => a.role !== "parent" && a.email);
  return (
    <Card title={m.status === "held" ? "Meeting held" : "Scheduled"} subtitle={m.chosen && `${fmt(m.chosen.date)}, ${fmtTime(m.chosen.start)} at ${m.location}`}>
      {m.status === "scheduled" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => st.checkResponses(m.id).catch(() => {})}>Check calendar responses</Button>
            {st.connection?.kind === "demo" && m.eventId && staffAttendee && (
              <Button
                variant="ghost"
                onClick={async () => {
                  st.mutateDemo((d) => simulateDecline(d, m.eventId!, staffAttendee.email!));
                  await useStore.getState().checkResponses(m.id).catch(() => {});
                }}
              >
                Demo: {staffAttendee.name} declines
              </Button>
            )}
          </div>
          <form
            className="flex items-end gap-2 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              st.markHeld(m.id, held);
            }}
          >
            <Field label="Meeting held on">
              <input type="date" className={inputCls} value={held} onChange={(e) => setHeld(e.target.value)} />
            </Field>
            <Button variant="primary" type="submit" disabled={st.profile.role === "viewer"}>
              Mark held
            </Button>
          </form>
        </div>
      )}
      {m.status === "held" && (
        <p className="text-sm text-accent">
          Done. The clock is satisfied {m.chosen && m.chosen.date <= m.deadline ? "on time" : ""}; the next annual is now on the calendar.
          <br />
          <span className="text-fg-muted">
            Deadline was <DateText d={m.deadline} />.
          </span>
        </p>
      )}
    </Card>
  );
}

function Escalation({ m }: { m: Meeting }) {
  const st = useStore();
  const s = st.students.find((x) => x.id === m.studentId)!;
  const director = st.profile.directorEmail;
  return (
    <Card className="mb-6 border-danger/30" title="No legal time available: needs a decision" subtitle={m.escalationReason}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => st.findTimes(m.id).catch(() => {})}>Try again</Button>
        {director && (
          <Button
            variant="primary"
            onClick={() =>
              st
                .sendInternal(
                  "escalation",
                  [director],
                  `Deadline at risk: ${MEETING_TYPE_LABELS[m.type]} for student ${s.id}`,
                  `The ${MEETING_TYPE_LABELS[m.type]} for student ${s.id} must be held by ${fmt(m.deadline)}.\n\n${m.escalationReason}\n\nOptions: free up a required attendee, ask the parent for a written extension, or approve a time outside normal hours.\n\n${st.coordinator().name}`,
                )
                .catch(() => {})
            }
          >
            Email the director
          </Button>
        )}
        <Link to={`/students/${s.id}`}>
          <Button variant="ghost">Record a parent extension</Button>
        </Link>
      </div>
    </Card>
  );
}
