import { create } from "zustand";
import { del, get as idbGet, set as idbSet } from "idb-keyval";
import { requiredAttendees } from "../agent/attendees";
import {
  DEFAULT_SETTINGS,
  type Attendee,
  type Meeting,
  type OutboundMessage,
  type Role,
  type Settings,
  type StaffMember,
  type TaskMark,
} from "../agent/model";
import { checkNotice, draftNotice, draftParentOptions, type Coordinator } from "../agent/notices";
import { proposeTimes } from "../agent/proposeTimes";
import { assessorTarget, clockTaskKey, computeAll, meetingTypeFor } from "../agent/queue";
import { parseReply } from "../agent/replyParser";
import { laToUtc } from "../agent/time";
import { appendEntry, type AuditEntry, type NewAuditEntry } from "../audit/log";
import type { RowError, UploadKind } from "../ingest/buildStudents";
import { mergeStudents } from "../ingest/buildStudents";
import { RULES_BY_ID } from "../rules/ca-rules";
import { addDays, fmt, todayISO, type ISODate } from "../rules/dates";
import type { ClockResult } from "../rules/engine";
import type { DistrictCalendar, SchoolYear } from "../rules/schoolDays";
import { emptyDemoState, makeDemoProvider, type DemoState } from "../integrations/demo";
import type { Provider, ProviderKind } from "../integrations/provider";
import type { ClockException, Student, StudentDateField } from "../types";

export interface Upload {
  id: string;
  fileName: string;
  kind: UploadKind;
  at: string;
  by: string;
  rowsRead: number;
  studentCount: number;
  errors: RowError[];
}

export interface Profile {
  district: string;
  coordinatorName: string;
  coordinatorEmail: string;
  coordinatorPhone?: string;
  role: Role;
  directorEmail?: string;
  defaultLocation: string;
  onboarded: boolean;
}

export interface ConnectionInfo {
  kind: ProviderKind;
  account: string;
  scope: "organization" | "personal" | "demo";
  connectedAt: string;
}

export interface ItPacketState {
  platform: "google" | "microsoft" | "unknown";
  itEmail?: string;
  sentAt?: string;
  followUpDraftedAt?: string;
  approvedAt?: string;
}

export interface PersistedState {
  version: 1;
  profile: Profile;
  settings: Settings;
  calendar: DistrictCalendar;
  students: Student[];
  uploads: Upload[];
  staff: StaffMember[];
  meetings: Meeting[];
  marks: Record<string, TaskMark>;
  audit: AuditEntry[];
  lastDue: Record<string, ISODate>; // "student:clock:start" → due, to log recalculations
  connection: ConnectionInfo | null;
  itPacket: ItPacketState;
  demo: DemoState;
  lastDigestOn?: ISODate;
  todayOverride?: ISODate; // demo/testing: pretend today is this date
}

const KEY = "sped-agent-state-v1";

export const initialState = (): PersistedState => ({
  version: 1,
  profile: {
    district: "",
    coordinatorName: "",
    coordinatorEmail: "",
    role: "coordinator",
    defaultLocation: "District Office, Room 12 (or by video; ask for a link)",
    onboarded: false,
  },
  settings: { ...DEFAULT_SETTINGS },
  calendar: { districtName: "", years: [] },
  students: [],
  uploads: [],
  staff: [],
  meetings: [],
  marks: {},
  audit: [],
  lastDue: {},
  connection: null,
  itPacket: { platform: "unknown" },
  demo: emptyDemoState(),
});

let provider: Provider | null = null;
export function getProvider(): Provider | null {
  return provider;
}

interface Actions {
  loaded: boolean;
  busy: string | null;
  error: string | null;
  load(): Promise<void>;
  today(): ISODate;
  set(patch: Partial<PersistedState>): void;
  log(e: Omit<NewAuditEntry, "user">): Promise<void>;
  user(): string;
  coordinator(): Coordinator;

  updateProfile(p: Partial<Profile>): Promise<void>;
  updateSettings(s: Partial<Settings>): Promise<void>;
  setRole(r: Role): Promise<void>;

  commitUpload(u: Omit<Upload, "id" | "at" | "by" | "studentCount">, students: Student[]): Promise<void>;
  confirmYear(y: SchoolYear): Promise<void>;
  removeYear(id: string): Promise<void>;
  setStaff(staff: StaffMember[]): Promise<void>;

  snapshot(): ReturnType<typeof computeAll>;
  logRecalculations(): Promise<void>;
  editDate(studentId: string, field: StudentDateField, value: ISODate | undefined, why: string): Promise<void>;
  addException(studentId: string, e: Omit<ClockException, "id" | "enteredBy" | "enteredAt">): Promise<void>;
  markTask(key: string, mark: Omit<TaskMark, "by" | "at">, done?: { studentId: string; field: StudentDateField; date: ISODate; clockId?: string }): Promise<void>;

  useDemo(): Promise<void>;
  /** Demo only: change the simulated inbox/calendars (e.g. a parent reply). */
  mutateDemo(fn: (d: DemoState) => DemoState): void;
  connect(kind: "google" | "microsoft", scope: "organization" | "personal"): Promise<void>;
  disconnect(): Promise<void>;

  startMeeting(r: ClockResult): Promise<string>;
  updateMeeting(id: string, patch: Partial<Meeting>): Promise<void>;
  setAttendees(id: string, attendees: Attendee[]): Promise<void>;
  findTimes(id: string): Promise<void>;
  editMessage(meetingId: string, msgId: string, patch: Partial<Pick<OutboundMessage, "subject" | "body" | "language">>): Promise<void>;
  approveAndSend(meetingId: string, msgId: string): Promise<void>;
  checkParent(meetingId: string): Promise<void>;
  choose(meetingId: string, index: number, how: string): Promise<void>;
  checkResponses(meetingId: string): Promise<void>;
  markHeld(meetingId: string, date: ISODate): Promise<void>;
  cancelMeeting(meetingId: string, reason: string): Promise<void>;

  sendInternal(kind: OutboundMessage["kind"], to: string[], subject: string, body: string): Promise<void>;
  deleteAllData(): Promise<void>;
}

export type Store = PersistedState & Actions;

const PERSIST_KEYS = Object.keys(initialState()) as (keyof PersistedState)[];

function newId(p: string) {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>()((set, get) => {
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = get();
      const data = Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]]));
      idbSet(KEY, data).catch((e) => console.error("save failed", e));
    }, 150);
  };
  const patch = (p: Partial<Store>) => {
    set(p);
    persist();
  };
  const meeting = (id: string) => {
    const m = get().meetings.find((x) => x.id === id);
    if (!m) throw new Error("Meeting not found");
    return m;
  };
  const studentOf = (m: Meeting) => get().students.find((s) => s.id === m.studentId)!;
  const replaceMeeting = (m: Meeting) => patch({ meetings: get().meetings.map((x) => (x.id === m.id ? m : x)) });
  const needProvider = () => {
    if (!provider) throw new Error("Connect a calendar (or use demo mode) in Connections first.");
    return provider;
  };
  const canApprove = () => {
    if (get().profile.role === "viewer") throw new Error("Viewers can't approve or send. Ask a coordinator.");
  };
  const withBusy = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    set({ busy: label, error: null });
    try {
      return await fn();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      set({ busy: null });
    }
  };
  const legalDeadline = (m: Meeting): ISODate => {
    const r = get().snapshot().clocks.find((c) => c.studentId === m.studentId && c.clockId === m.clockId);
    return r?.dueDate ?? m.deadline;
  };

  return {
    ...initialState(),
    loaded: false,
    busy: null,
    error: null,

    async load() {
      // Storage can be unavailable (private windows, embedded frames); start fresh then.
      const data = (await idbGet(KEY).catch(() => undefined)) as PersistedState | undefined;
      const base = initialState();
      const merged = data ? { ...base, ...data, settings: { ...base.settings, ...data.settings }, profile: { ...base.profile, ...data.profile } } : base;
      set({ ...merged, loaded: true });
      if (merged.connection?.kind === "demo") provider = makeDemoProvider(merged.connection.account, merged.demo, (demo) => patch({ demo }));
      else if (merged.connection) patch({ connection: null }); // real tokens aren't stored; reconnect after reload
    },

    today() {
      return get().todayOverride ?? todayISO();
    },
    set(p) {
      patch(p);
    },
    user() {
      const p = get().profile;
      return p.coordinatorEmail || p.coordinatorName || "coordinator";
    },
    coordinator() {
      const p = get().profile;
      return { name: p.coordinatorName || "Special Education Coordinator", email: p.coordinatorEmail || "coordinator@district.org", phone: p.coordinatorPhone, district: p.district || "Your district" };
    },
    async log(e) {
      const entry = await appendEntry(get().audit, { ...e, user: get().user() });
      patch({ audit: [...get().audit, entry] });
    },

    async updateProfile(p) {
      patch({ profile: { ...get().profile, ...p } });
      if (p.district) patch({ calendar: { ...get().calendar, districtName: p.district } });
    },
    async updateSettings(s) {
      patch({ settings: { ...get().settings, ...s } });
      const safe = Object.keys(s).filter((k) => !["anthropicKey", "googleClientId", "msClientId", "msTenant", "supportUrl"].includes(k));
      if (safe.length) await get().log({ action: "settings", summary: `Changed settings: ${safe.join(", ")}` });
      await get().logRecalculations();
    },
    async setRole(role) {
      patch({ profile: { ...get().profile, role } });
      await get().log({ action: "role-changed", summary: `Role set to ${role}` });
    },

    async commitUpload(u, students) {
      const id = newId("up");
      const upload: Upload = { ...u, id, at: new Date().toISOString(), by: get().user(), studentCount: students.length };
      const tagged = students.map((s) => ({ ...s, sources: [id] }));
      patch({ uploads: [...get().uploads, upload], students: mergeStudents(get().students, tagged) });
      await get().log({
        action: "upload",
        summary: `Uploaded ${u.fileName} (${u.kind}): ${students.length} students from ${u.rowsRead} rows, ${u.errors.length} row issue(s)`,
        details: { fileName: u.fileName, kind: u.kind, rows: u.rowsRead, students: students.length, errors: u.errors.length },
      });
      await get().logRecalculations();
    },
    async confirmYear(y) {
      const years = [...get().calendar.years.filter((x) => x.id !== y.id), { ...y, confirmedBy: get().user(), confirmedAt: new Date().toISOString() }];
      patch({ calendar: { districtName: get().profile.district, years } });
      await get().log({
        action: "calendar-confirmed",
        summary: `Confirmed ${y.id} calendar: ${y.firstDay} to ${y.lastDay}, ${y.breaks.length} non-school periods${y.source ? ` (from ${y.source})` : ""}`,
        details: { firstDay: y.firstDay, lastDay: y.lastDay, breaks: y.breaks },
      });
      await get().logRecalculations();
    },
    async removeYear(id) {
      patch({ calendar: { ...get().calendar, years: get().calendar.years.filter((y) => y.id !== id) } });
      await get().log({ action: "calendar-confirmed", summary: `Removed ${id} calendar` });
      await get().logRecalculations();
    },
    async setStaff(staff) {
      patch({ staff });
      await get().log({ action: "settings", summary: `Staff directory updated (${staff.length} people)` });
    },

    snapshot() {
      const s = get();
      return computeAll(s.students, s.calendar, s.today(), s.settings);
    },

    /** P0-6: log every new or changed deadline with its rule. */
    async logRecalculations() {
      if (!get().calendar.years.length) return;
      const snap = get().snapshot();
      const lastDue = { ...get().lastDue };
      const changes: ClockResult[] = [];
      for (const r of snap.clocks) {
        const k = clockTaskKey(r);
        if (lastDue[k] !== r.dueDate) {
          changes.push(r);
          lastDue[k] = r.dueDate;
        }
      }
      if (!changes.length) return;
      // One summary entry plus one per student-clock, so each date is traceable.
      let audit = get().audit;
      const user = get().user();
      audit = [...audit, await appendEntry(audit, { user, action: "calculated", summary: `Calculated ${changes.length} deadline(s) under California rules` })];
      for (const r of changes) {
        audit = [
          ...audit,
          await appendEntry(audit, {
            user: "agent",
            action: "calculated",
            studentId: r.studentId,
            clockId: r.clockId,
            rule: r.citation,
            summary: `${r.label}: due ${fmt(r.dueDate)} (start ${r.startDate}${r.skipped.length ? `, skipped ${r.skipped.length} break(s)` : ""}${r.endOfYearApplied ? ", end-of-year rule" : ""})`,
            details: { working: r.working },
          }),
        ];
      }
      patch({ audit, lastDue });
    },

    async editDate(studentId, field, value, why) {
      const students = get().students.map((s) => (s.id === studentId ? { ...s, dates: { ...s.dates, [field]: value } } : s));
      patch({ students });
      await get().log({ action: "date-edited", studentId, summary: `${field} set to ${value ?? "(blank)"}${why ? `: ${why}` : ""}` });
      await get().logRecalculations();
    },
    async addException(studentId, e) {
      canApprove();
      const ex: ClockException = { ...e, id: newId("ex"), enteredBy: get().user(), enteredAt: new Date().toISOString() };
      patch({ students: get().students.map((s) => (s.id === studentId ? { ...s, exceptions: [...s.exceptions, ex] } : s)) });
      await get().log({
        action: "exception-recorded",
        studentId,
        clockId: e.clockId,
        rule: RULES_BY_ID[e.clockId as keyof typeof RULES_BY_ID]?.citation,
        summary: `${e.kind}${e.agreedDate ? ` to ${e.agreedDate}` : ""}: ${e.note}`,
        details: { documentRef: e.documentRef },
      });
      await get().logRecalculations();
    },
    async markTask(key, mark, done) {
      patch({ marks: { ...get().marks, [key]: { ...mark, by: get().user(), at: new Date().toISOString() } } });
      if (done) {
        patch({ students: get().students.map((s) => (s.id === done.studentId ? { ...s, dates: { ...s.dates, [done.field]: done.date } } : s)) });
      }
      await get().log({
        action: mark.status === "done" ? "task-done" : "task-snoozed",
        studentId: done?.studentId ?? key.split(":")[0],
        clockId: done?.clockId ?? key.split(":")[1],
        summary: mark.status === "done" ? `Marked done${done ? ` (${done.field} = ${done.date})` : ""}${mark.reason ? `: ${mark.reason}` : ""}` : `Snoozed until ${mark.until}: ${mark.reason}`,
      });
      await get().logRecalculations();
    },

    async useDemo() {
      const account = get().profile.coordinatorEmail || "coordinator@sample-unified.org";
      provider = makeDemoProvider(account, get().demo, (demo) => patch({ demo }));
      patch({ connection: { kind: "demo", account, scope: "demo", connectedAt: new Date().toISOString() } });
      await get().log({ action: "connection", summary: "Using demo calendars and outbox (nothing is sent)" });
    },
    mutateDemo(fn) {
      const demo = fn(get().demo);
      patch({ demo });
      if (get().connection?.kind === "demo") provider = makeDemoProvider(get().connection!.account, demo, (d) => patch({ demo: d }));
    },
    async connect(kind, scope) {
      await withBusy(`Connecting ${kind === "google" ? "Google" : "Microsoft"}…`, async () => {
        const s = get().settings;
        if (kind === "google") {
          if (!s.googleClientId) throw new Error("Add a Google OAuth client ID in Settings first (see the README).");
          const { connectGoogle } = await import("../integrations/google");
          provider = await connectGoogle(s.googleClientId);
        } else {
          if (!s.msClientId) throw new Error("Add a Microsoft app (client) ID in Settings first (see the README).");
          const { connectMicrosoft } = await import("../integrations/microsoft");
          provider = await connectMicrosoft(s.msClientId, s.msTenant || "organizations");
        }
        patch({ connection: { kind, account: provider.account, scope, connectedAt: new Date().toISOString() } });
        await get().log({ action: "connection", summary: `Connected ${kind} as ${provider.account} (${scope} access)` });
      });
    },
    async disconnect() {
      await provider?.disconnect();
      provider = null;
      const c = get().connection;
      patch({ connection: null });
      if (c) await get().log({ action: "connection", summary: `Disconnected ${c.kind} (${c.account})` });
    },

    // ── P1: meetings ────────────────────────────────────────────────────
    async startMeeting(r) {
      const existing = get().meetings.find((m) => m.studentId === r.studentId && m.clockId === r.clockId && !["held", "cancelled"].includes(m.status));
      if (existing) return existing.id;
      const s = get().students.find((x) => x.id === r.studentId)!;
      const type = meetingTypeFor(r, s);
      const m: Meeting = {
        id: newId("mtg"),
        studentId: r.studentId,
        clockId: r.clockId,
        type,
        deadline: r.actionBy,
        latestAllowed: r.actionBy,
        attendees: requiredAttendees(type, s, get().staff),
        options: [],
        status: "planning",
        messages: [],
        location: get().profile.defaultLocation,
        parentLanguage: s.parentLanguage || "English",
        createdAt: new Date().toISOString(),
        parentReplies: [],
      };
      patch({ meetings: [...get().meetings, m] });
      await get().log({ action: "meeting-created", studentId: r.studentId, clockId: r.clockId, rule: r.citation, summary: `Started scheduling ${type} meeting; must be held by ${fmt(r.actionBy)}` });
      return m.id;
    },
    async updateMeeting(id, p) {
      replaceMeeting({ ...meeting(id), ...p });
    },
    async setAttendees(id, attendees) {
      replaceMeeting({ ...meeting(id), attendees });
      await get().log({ action: "meeting-created", studentId: meeting(id).studentId, summary: `Attendees: ${attendees.map((a) => `${a.name} (${a.role})`).join(", ")}` });
    },

    async findTimes(id) {
      await withBusy("Finding times…", async () => {
        const p = needProvider();
        const m = meeting(id);
        const s = get().settings;
        const cal = get().calendar;
        const today = get().today();
        const emails = m.attendees.filter((a) => a.role !== "parent" && a.email).map((a) => a.email!);
        const r = get().snapshot().clocks.find((c) => c.studentId === m.studentId && c.clockId === m.clockId);
        const deadline = r?.actionBy ?? m.deadline;
        const earliest = m.clockId === "eval-meeting" && r ? addDays(assessorTarget(r, cal, s), 1) : undefined;
        const busy = await p.freeBusy(emails, laToUtc(today, "00:00"), laToUtc(addDays(deadline, 1), "00:00"));
        // When rescheduling, don't offer the declined time or the options the parent already passed on.
        const exclude = m.status === "needs-reschedule" ? [...(m.chosen ? [m.chosen] : []), ...m.options] : [];
        const result = proposeTimes({ cal, today, deadline, earliest: earliest && earliest < deadline ? earliest : undefined, busy, settings: s, exclude });
        const student = studentOf(m);
        const next: Meeting = { ...m, deadline, latestAllowed: result.latestAllowed, options: result.slots };
        if (result.slots.length === 0) {
          next.status = "escalated";
          next.escalationReason = `${result.escalate} Deadline ${fmt(deadline)}. Options: ask the parent for a written extension, free up a required attendee, or have the director step in.`;
          replaceMeeting(next);
          await get().log({ action: "escalated", studentId: m.studentId, clockId: m.clockId, summary: next.escalationReason });
          return;
        }
        const draft = draftParentOptions(next, student, get().coordinator());
        const msg: OutboundMessage = {
          id: newId("msg"),
          kind: "parent-options",
          to: student.parentEmail ? [student.parentEmail] : [],
          subject: draft.subject,
          body: draft.body,
          language: draft.language,
          status: "draft",
        };
        next.messages = [...m.messages.filter((x) => !(x.kind === "parent-options" && x.status === "draft")), msg];
        next.status = "options-ready";
        next.escalationReason = result.escalate;
        replaceMeeting(next);
        await get().log({
          action: "times-proposed",
          studentId: m.studentId,
          clockId: m.clockId,
          rule: r?.citation,
          summary: `Found ${result.slots.length} time(s) between ${result.windowStart} and ${result.insideBuffer ? deadline : result.latestAllowed}: ${result.slots.map((x) => `${x.date} ${x.start}`).join("; ")}${result.insideBuffer ? " (some inside the buffer)" : ""}`,
        });
        if (result.escalate) await get().log({ action: "escalated", studentId: m.studentId, clockId: m.clockId, summary: result.escalate });
      });
    },

    async editMessage(meetingId, msgId, p) {
      const m = meeting(meetingId);
      replaceMeeting({ ...m, messages: m.messages.map((x) => (x.id === msgId && x.status === "draft" ? { ...x, ...p } : x)) });
    },

    /**
     * The only path that sends anything to a family. It requires a coordinator
     * approval, records it in the audit log first, then sends.
     */
    async approveAndSend(meetingId, msgId) {
      await withBusy("Sending…", async () => {
        canApprove();
        const p = needProvider();
        const m = meeting(meetingId);
        const s = studentOf(m);
        const msg = m.messages.find((x) => x.id === msgId);
        if (!msg || msg.status !== "draft") throw new Error("This message isn't waiting for approval.");
        if (!msg.to.length) throw new Error("No parent email on file. Add one on the student page, or contact the family another way.");
        if (msg.kind === "notice" || msg.kind === "notice-update") {
          const checks = checkNotice(m, s, msg.body, msg.language, legalDeadline(m));
          if (checks.some((c) => !c.ok)) throw new Error(`The notice is missing: ${checks.filter((c) => !c.ok).map((c) => c.label).join(", ")}.`);
        }
        const approvedAt = new Date().toISOString();
        await get().log({
          action: msg.kind.startsWith("notice") ? "notice-approved" : "message-approved",
          studentId: m.studentId,
          clockId: m.clockId,
          summary: `Approved "${msg.subject}" to ${msg.to.join(", ")} (${msg.language})`,
          details: { messageId: msg.id, body: msg.body },
        });
        const approved: OutboundMessage = { ...msg, status: "approved", approvedBy: get().user(), approvedAt };
        if (!get().audit.some((e) => (e.details as { messageId?: string } | undefined)?.messageId === msg.id)) throw new Error("Approval wasn't recorded; not sending.");

        const threadId = m.messages.find((x) => x.threadId)?.threadId;
        let sent: OutboundMessage;
        try {
          const res = await p.sendMail({ to: approved.to, subject: approved.subject, body: approved.body, threadId });
          sent = { ...approved, status: "sent", sentAt: new Date().toISOString(), providerMessageId: res.messageId, threadId: res.threadId };
        } catch (e) {
          // Back to the approval queue with the error, so it can be retried.
          sent = { ...msg, error: e instanceof Error ? e.message : String(e) };
        }
        const next: Meeting = { ...meeting(meetingId), messages: meeting(meetingId).messages.map((x) => (x.id === msg.id ? sent : x)) };
        if (sent.status === "sent") {
          if (msg.kind === "parent-options") {
            next.status = "awaiting-parent";
            next.lastParentContactAt = sent.sentAt;
          } else {
            next.status = "scheduled";
            if (next.eventId && next.chosen) {
              await p.updateEvent(next.eventId, eventInput(next, s, false));
              await get().log({ action: "calendar-hold", studentId: m.studentId, summary: `Calendar event confirmed for ${next.chosen.date} ${next.chosen.start}` });
            }
          }
        }
        replaceMeeting(next);
        await get().log({
          action: "message-sent",
          studentId: m.studentId,
          clockId: m.clockId,
          summary: sent.status === "sent" ? `Sent "${msg.subject}" via ${p.kind} as ${p.account}` : `Send failed: ${sent.error}`,
        });
        if (sent.status !== "sent") throw new Error(`Couldn't send: ${sent.error}. It's still waiting for approval; try again.`);
      });
    },

    async checkParent(meetingId) {
      await withBusy("Checking replies…", async () => {
        const p = needProvider();
        const m = meeting(meetingId);
        const sentMsg = [...m.messages].reverse().find((x) => x.kind === "parent-options" && x.status === "sent");
        if (!sentMsg?.threadId) return;
        const since = m.parentReplies.at(-1)?.at ?? sentMsg.sentAt!;
        const replies = await p.replies(sentMsg.threadId, since);
        if (!replies.length) return;
        let next = { ...m };
        for (const r of replies) {
          const parsed = parseReply(r.body, m.options);
          next = { ...next, parentReplies: [...next.parentReplies, { at: r.receivedAt, body: r.body, parsed: parsed.explanation }] };
          replaceMeeting(next);
          await get().log({ action: "parent-replied", studentId: m.studentId, summary: `Parent replied: ${parsed.explanation}`, details: { body: r.body } });
          if (parsed.choice !== null && parsed.confidence === "high") {
            await get().choose(meetingId, parsed.choice, "parent reply");
            return;
          }
          if (parsed.none) {
            replaceMeeting({ ...meeting(meetingId), status: "needs-reschedule", chosen: undefined });
            await get().log({ action: "reschedule", studentId: m.studentId, summary: "Parent said none of the times work; finding new ones" });
            return;
          }
        }
      });
    },

    async choose(meetingId, index, how) {
      const p = needProvider();
      const m = meeting(meetingId);
      const s = studentOf(m);
      const slot = m.options[index];
      if (!slot) throw new Error("No such option");
      const next: Meeting = { ...m, chosen: slot };
      // Hold it on everyone's calendar (tentative until the notice is approved).
      const input = eventInput(next, s, true);
      if (next.eventId) await p.updateEvent(next.eventId, input);
      else next.eventId = (await p.createEvent(input)).id;
      await get().log({ action: "calendar-hold", studentId: m.studentId, clockId: m.clockId, summary: `Held ${slot.date} ${slot.start}–${slot.end} on ${input.attendees.length} calendars (${how})` });
      const wasScheduled = m.messages.some((x) => x.kind === "notice" && x.status === "sent");
      const draft = draftNotice(next, s, get().coordinator(), { update: wasScheduled });
      const msg: OutboundMessage = {
        id: newId("msg"),
        kind: wasScheduled ? "notice-update" : "notice",
        to: s.parentEmail ? [s.parentEmail] : [],
        subject: draft.subject,
        body: draft.body,
        language: draft.language,
        status: "draft",
      };
      msg.checks = checkNotice(next, s, msg.body, msg.language, legalDeadline(next));
      next.messages = [...next.messages.filter((x) => !(x.status === "draft" && x.kind.startsWith("notice"))), msg];
      next.status = "notice-draft";
      replaceMeeting(next);
    },

    async checkResponses(meetingId) {
      await withBusy("Checking calendar responses…", async () => {
        const p = needProvider();
        const m = meeting(meetingId);
        if (!m.eventId) return;
        const responses = await p.attendeeResponses(m.eventId);
        const attendees = m.attendees.map((a) => (a.email ? { ...a, response: responses[a.email.toLowerCase()] ?? a.response } : a));
        const declined = attendees.filter((a) => a.required && a.response === "declined");
        replaceMeeting({ ...m, attendees, status: declined.length && m.status === "scheduled" ? "needs-reschedule" : m.status });
        if (declined.length && m.status === "scheduled") {
          await get().log({ action: "reschedule", studentId: m.studentId, clockId: m.clockId, summary: `${declined.map((d) => d.name).join(", ")} declined; finding new times before ${fmt(m.deadline)}` });
        }
      });
    },

    async markHeld(meetingId, date) {
      const m = meeting(meetingId);
      const field: StudentDateField =
        m.clockId === "eval-meeting" ? "evalMeetingHeld" : m.clockId === "parent-request-meeting" ? "parentRequestMeetingHeld" : m.clockId === "triennial" ? "lastTriennial" : "lastAnnual";
      replaceMeeting({ ...m, status: "held" });
      const s = studentOf(m);
      const dates: Student["dates"] = { ...s.dates, [field]: date };
      // An initial or triennial IEP also starts the next annual (and triennial) cycle.
      if (m.clockId === "eval-meeting" || m.clockId === "triennial") {
        dates.lastAnnual = date;
        dates.lastTriennial = date;
      }
      patch({ students: get().students.map((x) => (x.id === s.id ? { ...x, dates } : x)) });
      await get().log({ action: "meeting-held", studentId: m.studentId, clockId: m.clockId, rule: RULES_BY_ID[m.clockId].citation, summary: `Meeting held ${fmt(date)}${date <= m.deadline ? "" : " (after the deadline)"}` });
      await get().logRecalculations();
    },
    async cancelMeeting(meetingId, reason) {
      const m = meeting(meetingId);
      replaceMeeting({ ...m, status: "cancelled" });
      await get().log({ action: "reschedule", studentId: m.studentId, summary: `Scheduling cancelled: ${reason}` });
    },

    /** Messages to staff (digest, IT packet, escalation). Not family-facing, so no approval gate. */
    async sendInternal(kind, to, subject, body) {
      await withBusy("Sending…", async () => {
        const p = needProvider();
        await p.sendMail({ to, subject, body });
        await get().log({ action: kind === "it-packet" ? "it-packet" : "message-sent", summary: `Sent ${kind} "${subject}" to ${to.join(", ")}` });
      });
    },

    async deleteAllData() {
      await provider?.disconnect().catch(() => {});
      provider = null;
      await del(KEY);
      set({ ...initialState(), loaded: true });
    },
  };
});

export function eventInput(m: Meeting, s: Student, tentative: boolean) {
  const typeLabel = { initial: "Initial IEP", triennial: "Triennial IEP", annual: "Annual IEP", "parent-request": "IEP (parent request)" }[m.type];
  return {
    title: `${tentative ? "HOLD: " : ""}${typeLabel}: student ${s.id}`,
    slot: m.chosen!,
    attendees: m.attendees.filter((a) => a.email).map((a) => ({ email: a.email!, name: a.name })),
    description: `${typeLabel} meeting. Must be held by ${m.deadline}. Scheduled by the SpEd Compliance Agent for ${s.id}.`,
    location: m.location,
    tentative,
  };
}
