import type { Busy } from "../agent/proposeTimes";
import { localDateTime, TZ } from "../agent/time";
import { buildMime, b64url, fromB64url, htmlToText } from "./mime";
import { GOOGLE_SCOPES } from "./scopes";
import type { AttendeeResponse, EventInput, InboundReply, MailInput, Provider } from "./provider";

/* Google Workspace via Google Identity Services (browser OAuth token client). */

export { GOOGLE_SCOPES };

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
  callback: (r: TokenResponse) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { message?: string }) => void }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Google sign-in. Check that accounts.google.com isn't blocked."));
    document.head.appendChild(s);
  });
}

export async function connectGoogle(clientId: string): Promise<Provider> {
  await loadGis();
  let token = "";
  let expiresAt = 0;
  let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
  const client = window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES.join(" "),
    callback: (r) => {
      if (r.error || !r.access_token) pending?.reject(new Error(r.error_description || r.error || "Google sign-in failed"));
      else {
        token = r.access_token;
        expiresAt = Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000;
        pending?.resolve(token);
      }
      pending = null;
    },
    error_callback: (e) => {
      pending?.reject(new Error(e.message || "Google sign-in was closed"));
      pending = null;
    },
  });
  const getToken = (prompt: string) =>
    new Promise<string>((resolve, reject) => {
      pending = { resolve, reject };
      client.requestAccessToken({ prompt });
    });
  await getToken("consent");

  async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
    if (Date.now() > expiresAt) await getToken("");
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 401) {
      await getToken("");
      return api(url, init);
    }
    if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : res.json();
  }

  const me = await api<{ email: string }>("https://www.googleapis.com/oauth2/v3/userinfo");
  return makeGoogleProvider(me.email, api, () => window.google?.accounts.oauth2.revoke(token));
}

type Api = <T>(url: string, init?: RequestInit) => Promise<T>;

/** Separated from sign-in so it can be tested against recorded API responses. */
export function makeGoogleProvider(account: string, api: Api, revoke: () => void = () => {}): Provider {
  const CAL = "https://www.googleapis.com/calendar/v3";
  const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
  const eventBody = (e: EventInput) => ({
    summary: e.title,
    description: e.description,
    location: e.location,
    start: { dateTime: localDateTime(e.slot.date, e.slot.start), timeZone: TZ },
    end: { dateTime: localDateTime(e.slot.date, e.slot.end), timeZone: TZ },
    attendees: e.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    status: e.tentative ? "tentative" : "confirmed",
    transparency: "opaque",
  });

  return {
    kind: "google",
    account,
    async freeBusy(emails, fromUtc, toUtc) {
      const r = await api<{ calendars: Record<string, { busy: { start: string; end: string }[]; errors?: unknown[] }> }>(`${CAL}/freeBusy`, {
        method: "POST",
        body: JSON.stringify({ timeMin: new Date(fromUtc).toISOString(), timeMax: new Date(toUtc).toISOString(), timeZone: TZ, items: emails.map((id) => ({ id })) }),
      });
      const out: Record<string, Busy[]> = {};
      for (const e of emails) {
        out[e] = (r.calendars[e]?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
      }
      return out;
    },
    async createEvent(e) {
      const r = await api<{ id: string }>(`${CAL}/calendars/primary/events?sendUpdates=all`, { method: "POST", body: JSON.stringify(eventBody(e)) });
      return { id: r.id };
    },
    async updateEvent(id, e) {
      await api(`${CAL}/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify(eventBody(e)) });
    },
    async attendeeResponses(id) {
      const r = await api<{ attendees?: { email: string; responseStatus: AttendeeResponse }[] }>(`${CAL}/calendars/primary/events/${encodeURIComponent(id)}`);
      return Object.fromEntries((r.attendees ?? []).map((a) => [a.email.toLowerCase(), a.responseStatus]));
    },
    async sendMail(m: MailInput) {
      const raw = b64url(buildMime(account, m.to, m.subject, m.body));
      const r = await api<{ id: string; threadId: string }>(`${GMAIL}/messages/send`, { method: "POST", body: JSON.stringify({ raw, threadId: m.threadId }) });
      return { messageId: r.id, threadId: r.threadId };
    },
    async replies(threadId, sinceIso) {
      const r = await api<{ messages: GmailMessage[] }>(`${GMAIL}/threads/${encodeURIComponent(threadId)}?format=full`);
      const since = Date.parse(sinceIso);
      return (r.messages ?? [])
        .map((msg): InboundReply => ({
          from: header(msg, "From"),
          body: bodyText(msg.payload),
          receivedAt: new Date(Number(msg.internalDate)).toISOString(),
        }))
        .filter((m) => Date.parse(m.receivedAt) > since && !m.from.toLowerCase().includes(account.toLowerCase()));
    },
    async disconnect() {
      revoke();
    },
  };
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}
interface GmailMessage {
  internalDate: string;
  payload: GmailPart;
}

function header(m: GmailMessage, name: string): string {
  return m.payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function bodyText(p: GmailPart): string {
  if (p.mimeType === "text/plain" && p.body?.data) return fromB64url(p.body.data);
  for (const c of p.parts ?? []) {
    const t = bodyText(c);
    if (t) return t;
  }
  if (p.mimeType === "text/html" && p.body?.data) return htmlToText(fromB64url(p.body.data));
  return "";
}

