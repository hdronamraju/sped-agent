import type { Busy } from "../agent/proposeTimes";
import { localDateTime } from "../agent/time";
import { htmlToText } from "./mime";
import { MS_SCOPES } from "./scopes";
import type { AttendeeResponse, EventInput, InboundReply, MailInput, Provider } from "./provider";

/* Microsoft 365 via MSAL.js (browser OAuth, PKCE) and Microsoft Graph. */

export { MS_SCOPES };
const GRAPH = "https://graph.microsoft.com/v1.0";
const MS_TZ = "Pacific Standard Time";

export async function connectMicrosoft(clientId: string, tenant = "organizations"): Promise<Provider> {
  const { PublicClientApplication, InteractionRequiredAuthError } = await import("@azure/msal-browser");
  const pca = new PublicClientApplication({
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenant}`, redirectUri: window.location.origin + window.location.pathname },
    cache: { cacheLocation: "sessionStorage" },
  });
  await pca.initialize();
  const login = await pca.loginPopup({ scopes: MS_SCOPES, prompt: "select_account" });
  const account = login.account;

  async function token(): Promise<string> {
    try {
      return (await pca.acquireTokenSilent({ scopes: MS_SCOPES, account })).accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) return (await pca.acquireTokenPopup({ scopes: MS_SCOPES, account })).accessToken;
      throw e;
    }
  }
  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return makeMicrosoftProvider(account.username, api, () => pca.logoutPopup({ account }));
}

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

export function makeMicrosoftProvider(accountEmail: string, api: Api, logout: () => Promise<void> | void = () => {}): Provider {
  const eventBody = (e: EventInput) => ({
    subject: e.title,
    body: { contentType: "Text", content: e.description },
    start: { dateTime: localDateTime(e.slot.date, e.slot.start), timeZone: MS_TZ },
    end: { dateTime: localDateTime(e.slot.date, e.slot.end), timeZone: MS_TZ },
    location: { displayName: e.location },
    attendees: e.attendees.map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: "required" })),
    showAs: e.tentative ? "tentative" : "busy",
  });
  const mapResponse: Record<string, AttendeeResponse> = {
    accepted: "accepted",
    declined: "declined",
    tentativelyAccepted: "tentative",
    none: "needsAction",
    notResponded: "needsAction",
    organizer: "accepted",
  };

  return {
    kind: "microsoft",
    account: accountEmail,
    async freeBusy(emails, fromUtc, toUtc) {
      const r = await api<{ value: { scheduleId: string; scheduleItems?: { status: string; start: { dateTime: string }; end: { dateTime: string } }[] }[] }>(
        "/me/calendar/getSchedule",
        {
          method: "POST",
          headers: { Prefer: 'outlook.timezone="UTC"' },
          body: JSON.stringify({
            schedules: emails,
            startTime: { dateTime: new Date(fromUtc).toISOString().slice(0, 19), timeZone: "UTC" },
            endTime: { dateTime: new Date(toUtc).toISOString().slice(0, 19), timeZone: "UTC" },
            availabilityViewInterval: 30,
          }),
        },
      );
      const out: Record<string, Busy[]> = Object.fromEntries(emails.map((e) => [e, []]));
      for (const s of r.value) {
        const key = emails.find((e) => e.toLowerCase() === s.scheduleId.toLowerCase()) ?? s.scheduleId;
        out[key] = (s.scheduleItems ?? [])
          .filter((i) => i.status !== "free")
          .map((i) => ({ start: Date.parse(`${i.start.dateTime.slice(0, 19)}Z`), end: Date.parse(`${i.end.dateTime.slice(0, 19)}Z`) }));
      }
      return out;
    },
    async createEvent(e) {
      const r = await api<{ id: string }>("/me/events", { method: "POST", body: JSON.stringify(eventBody(e)) });
      return { id: r.id };
    },
    async updateEvent(id, e) {
      await api(`/me/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(eventBody(e)) });
    },
    async attendeeResponses(id) {
      const r = await api<{ attendees: { emailAddress: { address: string }; status: { response: string } }[] }>(`/me/events/${encodeURIComponent(id)}?$select=attendees`);
      return Object.fromEntries(r.attendees.map((a) => [a.emailAddress.address.toLowerCase(), mapResponse[a.status.response] ?? "needsAction"]));
    },
    async sendMail(m: MailInput) {
      const draft = await api<{ id: string; conversationId: string }>("/me/messages", {
        method: "POST",
        body: JSON.stringify({ subject: m.subject, body: { contentType: "Text", content: m.body }, toRecipients: m.to.map((address) => ({ emailAddress: { address } })) }),
      });
      await api(`/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST" });
      return { messageId: draft.id, threadId: m.threadId ?? draft.conversationId };
    },
    async replies(threadId, sinceIso) {
      const filter = encodeURIComponent(`conversationId eq '${threadId.replace(/'/g, "''")}'`);
      const r = await api<{ value: { from?: { emailAddress: { address: string } }; uniqueBody?: { content: string; contentType: string }; receivedDateTime: string }[] }>(
        `/me/messages?$filter=${filter}&$select=from,uniqueBody,receivedDateTime&$top=50`,
      );
      return r.value
        .map((m): InboundReply => ({
          from: m.from?.emailAddress.address ?? "",
          body: m.uniqueBody?.contentType === "html" ? htmlToText(m.uniqueBody.content) : m.uniqueBody?.content ?? "",
          receivedAt: new Date(m.receivedDateTime).toISOString(),
        }))
        .filter((m) => m.receivedAt > sinceIso && m.from.toLowerCase() !== accountEmail.toLowerCase())
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    },
    async disconnect() {
      await logout();
    },
  };
}
