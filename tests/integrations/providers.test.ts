import { describe, expect, it } from "vitest";
import { makeGoogleProvider } from "../../src/integrations/google";
import { makeMicrosoftProvider } from "../../src/integrations/microsoft";
import { b64url, fromB64url } from "../../src/integrations/mime";
import { emptyDemoState, makeDemoProvider, simulateDecline, simulateParentReply } from "../../src/integrations/demo";

type Call = { url: string; init?: RequestInit };

/** Fake API: returns recorded responses keyed by URL substring, records calls. */
function fakeApi(responses: [string, unknown][]) {
  const calls: Call[] = [];
  const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    calls.push({ url, init });
    const hit = responses.find(([k]) => url.includes(k));
    if (!hit) throw new Error(`no fake for ${url}`);
    return hit[1] as T;
  };
  return { api, calls };
}

const event = {
  title: "HOLD: Initial IEP: student 1001",
  slot: { date: "2027-01-12", start: "15:00", end: "16:00" },
  attendees: [{ email: "patel@x.org", name: "Dr. Patel" }],
  description: "d",
  location: "Room 4",
  tentative: true,
};

describe("Google provider (recorded responses)", () => {
  it("maps freeBusy", async () => {
    const { api, calls } = fakeApi([["/freeBusy", { calendars: { "patel@x.org": { busy: [{ start: "2027-01-12T23:00:00Z", end: "2027-01-13T00:00:00Z" }] } } }]]);
    const p = makeGoogleProvider("maria@x.org", api);
    const r = await p.freeBusy(["patel@x.org", "nobody@x.org"], 0, 1);
    expect(r["patel@x.org"]).toEqual([{ start: Date.parse("2027-01-12T23:00:00Z"), end: Date.parse("2027-01-13T00:00:00Z") }]);
    expect(r["nobody@x.org"]).toEqual([]);
    expect(JSON.parse(String(calls[0].init?.body)).timeZone).toBe("America/Los_Angeles");
  });
  it("creates tentative events with local times and sends updates", async () => {
    const { api, calls } = fakeApi([["/events", { id: "evt1" }]]);
    const r = await makeGoogleProvider("maria@x.org", api).createEvent(event);
    expect(r.id).toBe("evt1");
    expect(calls[0].url).toContain("sendUpdates=all");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ status: "tentative", start: { dateTime: "2027-01-12T15:00:00", timeZone: "America/Los_Angeles" } });
  });
  it("reads attendee responses", async () => {
    const { api } = fakeApi([["/events/evt1", { attendees: [{ email: "Patel@x.org", responseStatus: "declined" }] }]]);
    expect(await makeGoogleProvider("m@x.org", api).attendeeResponses("evt1")).toEqual({ "patel@x.org": "declined" });
  });
  it("sends UTF-8 mail and reads replies from others only", async () => {
    const { api, calls } = fakeApi([
      ["/messages/send", { id: "m1", threadId: "t1" }],
      [
        "/threads/t1",
        {
          messages: [
            { internalDate: String(Date.parse("2026-12-10T17:00:00Z")), payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Maria <maria@x.org>" }], body: { data: b64url("opciones") } } },
            {
              internalDate: String(Date.parse("2026-12-11T17:00:00Z")),
              payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: "Rosa <rosa@example.com>" }], parts: [{ mimeType: "text/plain", body: { data: b64url("La 2, gracias") } }] },
            },
          ],
        },
      ],
    ]);
    const p = makeGoogleProvider("maria@x.org", api);
    const sent = await p.sendMail({ to: ["rosa@example.com"], subject: "Reunión del IEP", body: "Hola, ¿qué hora?" });
    expect(sent).toEqual({ messageId: "m1", threadId: "t1" });
    const raw = fromB64url(JSON.parse(String(calls[0].init?.body)).raw);
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain("To: rosa@example.com");
    const replies = await p.replies("t1", "2026-12-10T18:00:00Z");
    expect(replies).toEqual([{ from: "Rosa <rosa@example.com>", body: "La 2, gracias", receivedAt: "2026-12-11T17:00:00.000Z" }]);
  });
});

describe("Microsoft provider (recorded responses)", () => {
  it("maps getSchedule busy items (UTC) and ignores free", async () => {
    const { api } = fakeApi([
      [
        "/getSchedule",
        { value: [{ scheduleId: "Patel@x.org", scheduleItems: [{ status: "busy", start: { dateTime: "2027-01-12T23:00:00.0000000" }, end: { dateTime: "2027-01-13T00:00:00.0000000" } }, { status: "free", start: { dateTime: "2027-01-12T17:00:00" }, end: { dateTime: "2027-01-12T18:00:00" } }] }] },
      ],
    ]);
    const r = await makeMicrosoftProvider("maria@x.org", api).freeBusy(["patel@x.org"], 0, 1);
    expect(r["patel@x.org"]).toEqual([{ start: Date.parse("2027-01-12T23:00:00Z"), end: Date.parse("2027-01-13T00:00:00Z") }]);
  });
  it("maps responses and sends via draft + send", async () => {
    const { api, calls } = fakeApi([
      ["/me/events/e1", { attendees: [{ emailAddress: { address: "patel@x.org" }, status: { response: "tentativelyAccepted" } }] }],
      ["/send", undefined],
      ["/me/messages", { id: "d1", conversationId: "c1" }],
    ]);
    const p = makeMicrosoftProvider("maria@x.org", api);
    expect(await p.attendeeResponses("e1")).toEqual({ "patel@x.org": "tentative" });
    expect(await p.sendMail({ to: ["rosa@example.com"], subject: "s", body: "b" })).toEqual({ messageId: "d1", threadId: "c1" });
    expect(calls.map((c) => c.url)).toContain("/me/messages/d1/send");
  });
});

describe("demo provider", () => {
  it("records mail, holds events and simulates replies and declines", async () => {
    let state = emptyDemoState();
    const p = () => makeDemoProvider("maria@x.org", state, (s) => (state = s));
    const sent = await p().sendMail({ to: ["rosa@example.com"], subject: "s", body: "b" });
    expect(state.sent).toHaveLength(1);
    state = simulateParentReply(state, sent.threadId, "rosa@example.com", "2");
    expect((await p().replies(sent.threadId, "2000-01-01"))[0].body).toBe("2");
    const ev = await p().createEvent(event);
    state = simulateDecline(state, ev.id, "patel@x.org");
    expect((await p().attendeeResponses(ev.id))["patel@x.org"]).toBe("declined");
    const busy = await p().freeBusy(["patel@x.org"], Date.parse("2027-01-12T08:00:00Z"), Date.parse("2027-01-13T08:00:00Z"));
    expect(busy["patel@x.org"].length).toBeGreaterThan(2);
  });
});
