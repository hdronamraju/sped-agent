import type { Busy } from "../agent/proposeTimes";
import type { Slot } from "../agent/model";

export type ProviderKind = "google" | "microsoft" | "demo";

export interface EventInput {
  title: string;
  slot: Slot;
  attendees: { email: string; name?: string }[];
  description: string;
  location: string;
  tentative: boolean;
}

export interface MailInput {
  to: string[];
  subject: string;
  body: string; // plain text
  threadId?: string;
}

export interface InboundReply {
  from: string;
  body: string;
  receivedAt: string; // ISO timestamp
}

export type AttendeeResponse = "accepted" | "declined" | "tentative" | "needsAction";

/**
 * What the agent needs from a calendar and mail platform. Everything runs in
 * the coordinator's browser with their own sign-in; there is no server.
 */
export interface Provider {
  kind: ProviderKind;
  account: string;
  /** Free/busy for each address over [from, to] (UTC ms). */
  freeBusy(emails: string[], fromUtc: number, toUtc: number): Promise<Record<string, Busy[]>>;
  createEvent(e: EventInput): Promise<{ id: string }>;
  updateEvent(id: string, e: EventInput): Promise<void>;
  attendeeResponses(id: string): Promise<Record<string, AttendeeResponse>>;
  sendMail(m: MailInput): Promise<{ messageId: string; threadId: string }>;
  /** Replies in a thread after `sinceIso`, excluding the coordinator's own messages. */
  replies(threadId: string, sinceIso: string): Promise<InboundReply[]>;
  disconnect(): Promise<void>;
}

export const SCOPES_EXPLAINED = [
  { scope: "See free/busy times", why: "To find times when everyone on the IEP team is free. The agent can't read event details." },
  { scope: "Create and update calendar events", why: "To hold the chosen time on attendees' calendars and send invitations." },
  { scope: "Send email as you", why: "So parents and staff get messages from a sender they know. Nothing goes to a family without your approval." },
  { scope: "Read replies to messages the agent sent", why: "To see which time a parent picked. Only threads the agent started are read." },
];
