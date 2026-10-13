import type { Busy } from "../agent/proposeTimes";
import { laToUtc } from "../agent/time";
import { addDays, fromUTC, type ISODate } from "../rules/dates";
import type { AttendeeResponse, EventInput, InboundReply, MailInput, Provider } from "./provider";

/**
 * Demo mode: sample staff calendars and a local outbox, so the whole flow works
 * before IT connects anything. Nothing leaves the browser.
 */

export interface DemoState {
  sent: { id: string; threadId: string; to: string[]; subject: string; body: string; at: string }[];
  events: Record<string, { input: EventInput; responses: Record<string, AttendeeResponse> }>;
  inbox: Record<string, InboundReply[]>; // by thread
}

export function emptyDemoState(): DemoState {
  return { sent: [], events: {}, inbox: {} };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic busy blocks: each person has 2–4 one-hour commitments a day (classes, other meetings). */
export function demoBusy(email: string, date: ISODate): Busy[] {
  const slots = ["07:30", "08:30", "09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:00", "15:30"];
  const h = hash(`${email}|${date}`);
  const n = 2 + (h % 3);
  const out: Busy[] = [];
  for (let i = 0; i < n; i++) {
    const t = slots[(h >>> (i * 4)) % slots.length];
    const start = laToUtc(date, t);
    out.push({ start, end: start + 60 * 60_000 });
  }
  return out;
}

export function makeDemoProvider(account: string, state: DemoState, onChange: (s: DemoState) => void): Provider {
  const save = () => onChange(structuredClone(state));
  let n = Object.keys(state.events).length + state.sent.length;
  const id = (p: string) => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`;
  return {
    kind: "demo",
    account,
    async freeBusy(emails, fromUtc, toUtc) {
      const out: Record<string, Busy[]> = {};
      for (const e of emails) {
        const list: Busy[] = [];
        for (let d = fromUTC(fromUtc); d <= fromUTC(toUtc); d = addDays(d, 1)) list.push(...demoBusy(e, d));
        // Events the agent already placed count as busy too.
        for (const ev of Object.values(state.events)) {
          if (ev.input.attendees.some((a) => a.email === e)) {
            list.push({ start: laToUtc(ev.input.slot.date, ev.input.slot.start), end: laToUtc(ev.input.slot.date, ev.input.slot.end) });
          }
        }
        out[e] = list;
      }
      return out;
    },
    async createEvent(e) {
      const eid = id("evt");
      state.events[eid] = { input: e, responses: Object.fromEntries(e.attendees.map((a) => [a.email.toLowerCase(), "accepted" as AttendeeResponse])) };
      save();
      return { id: eid };
    },
    async updateEvent(eid, e) {
      const ev = state.events[eid];
      state.events[eid] = { input: e, responses: Object.fromEntries(e.attendees.map((a) => [a.email.toLowerCase(), ev?.responses[a.email.toLowerCase()] === "declined" ? "needsAction" : "accepted"])) };
      save();
    },
    async attendeeResponses(eid) {
      return state.events[eid]?.responses ?? {};
    },
    async sendMail(m: MailInput) {
      const mid = id("msg");
      const threadId = m.threadId ?? id("thr");
      state.sent.push({ id: mid, threadId, to: m.to, subject: m.subject, body: m.body, at: new Date().toISOString() });
      save();
      return { messageId: mid, threadId };
    },
    async replies(threadId, sinceIso) {
      return (state.inbox[threadId] ?? []).filter((r) => r.receivedAt > sinceIso);
    },
    async disconnect() {},
  };
}

/** Demo-only: pretend the parent replied. */
export function simulateParentReply(state: DemoState, threadId: string, from: string, body: string): DemoState {
  const next = structuredClone(state);
  const list = (next.inbox[threadId] ??= []);
  // Strictly after the message it answers and any earlier reply, even on a frozen clock.
  const lastSent = Math.max(0, ...next.sent.filter((m) => m.threadId === threadId).map((m) => Date.parse(m.at)));
  const lastReply = Math.max(0, ...list.map((r) => Date.parse(r.receivedAt)));
  const at = Math.max(Date.now(), lastSent + 1000, lastReply + 1000);
  list.push({ from, body, receivedAt: new Date(at).toISOString() });
  return next;
}

/** Demo-only: pretend an attendee declined the calendar invite. */
export function simulateDecline(state: DemoState, eventId: string, email: string): DemoState {
  const next = structuredClone(state);
  if (next.events[eventId]) next.events[eventId].responses[email.toLowerCase()] = "declined";
  return next;
}
