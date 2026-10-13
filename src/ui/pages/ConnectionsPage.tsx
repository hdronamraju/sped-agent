import { useState } from "react";
import { SCOPES_EXPLAINED } from "../../integrations/provider";
import { detectPlatform, packetPdf, packetText, type Platform } from "../../itPacket/itPacket";
import { download } from "../../audit/export";
import { schoolDaysBetween } from "../../rules/schoolDays";
import { useStore } from "../../store/store";
import { Badge, Button, Card, Field, inputCls, PageHeader } from "../components";

export function ConnectionsPage() {
  const st = useStore();
  const conn = st.connection;
  const [scope, setScope] = useState<"organization" | "personal">("organization");
  return (
    <div>
      <PageHeader title="Calendar & email" subtitle="The agent sees free/busy times, holds meetings on calendars and emails families from your account. Everything runs in your browser with your own sign-in." />
      {conn && (
        <Card className="mb-6" title={`Connected: ${conn.kind === "demo" ? "demo calendars" : conn.kind === "google" ? "Google Workspace" : "Microsoft 365"}`} subtitle={`${conn.account} · ${conn.scope} access · since ${new Date(conn.connectedAt).toLocaleString()}`} action={<Button size="sm" onClick={() => st.disconnect()}>Disconnect</Button>}>
          {conn.kind === "demo" ? (
            <p className="text-sm text-fg-muted">Sample staff calendars and a local outbox. Nothing is actually sent. {st.demo.sent.length} message(s) in the demo outbox.</p>
          ) : (
            <p className="text-sm text-fg-muted">Sign-in tokens live only in this tab. After a reload you'll be asked to reconnect.</p>
          )}
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Demo mode" subtitle="Try scheduling before IT is involved.">
          <Button onClick={() => st.useDemo()} disabled={conn?.kind === "demo"}>
            Use demo calendars
          </Button>
        </Card>
        <Card title="Google Workspace" subtitle={st.settings.googleClientId ? "Client ID set" : "Needs a client ID from IT (see the IT packet)."}>
          <ScopePick scope={scope} setScope={setScope} />
          <Button variant="primary" className="mt-3" disabled={!st.settings.googleClientId || !!st.busy} onClick={() => st.connect("google", scope).catch(() => {})}>
            Connect Google
          </Button>
        </Card>
        <Card title="Microsoft 365" subtitle={st.settings.msClientId ? "App ID set" : "Needs an app ID from IT (see the IT packet)."}>
          <ScopePick scope={scope} setScope={setScope} />
          <Button variant="primary" className="mt-3" disabled={!st.settings.msClientId || !!st.busy} onClick={() => st.connect("microsoft", scope).catch(() => {})}>
            Connect Microsoft
          </Button>
        </Card>
      </div>
      <Card className="mt-6" title="What the agent can do, and why">
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          {SCOPES_EXPLAINED.map((s) => (
            <li key={s.scope}>
              <p className="font-medium">{s.scope}</p>
              <p className="text-fg-muted">{s.why}</p>
            </li>
          ))}
        </ul>
      </Card>
      <ItPacket />
    </div>
  );
}

function ScopePick({ scope, setScope }: { scope: "organization" | "personal"; setScope: (s: "organization" | "personal") => void }) {
  return (
    <div className="space-y-1 text-sm">
      <label className="flex items-center gap-2">
        <input type="radio" checked={scope === "organization"} onChange={() => setScope("organization")} /> District-approved (IT has approved the app)
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={scope === "personal"} onChange={() => setScope("personal")} /> Just my account for now
      </label>
    </div>
  );
}

/** P1-1: one forwarded email gets IT to connect everything. */
function ItPacket() {
  const st = useStore();
  const it = st.itPacket;
  const [detecting, setDetecting] = useState(false);
  const input = {
    district: st.profile.district || "our district",
    coordinatorName: st.profile.coordinatorName || "the special education coordinator",
    coordinatorEmail: st.profile.coordinatorEmail,
    platform: it.platform,
    appUrl: window.location.href.split("#")[0],
    bookingUrl: st.settings.supportUrl,
  };
  const text = packetText(input);
  const today = st.today();
  const waited = it.sentAt && !it.approvedAt ? schoolDaysBetween(st.calendar, it.sentAt.slice(0, 10), today) : 0;
  const followUp = waited >= 3;
  const mailto = (subject: string, body: string) => `mailto:${encodeURIComponent(it.itEmail ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function markSent() {
    st.set({ itPacket: { ...it, sentAt: new Date().toISOString() } });
    await st.log({ action: "it-packet", summary: `IT packet sent to ${it.itEmail} (${it.platform})` });
  }

  return (
    <Card
      className="mt-6"
      title="IT packet"
      subtitle="Everything IT needs to approve the connection, written for you. You only enter IT's email address."
      action={it.approvedAt ? <Badge color="green">IT approved</Badge> : it.sentAt ? <Badge color="blue">Sent {new Date(it.sentAt).toLocaleDateString()}</Badge> : <Badge>Not sent</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="IT contact email">
          <input type="email" className={inputCls} value={it.itEmail ?? ""} onChange={(e) => st.set({ itPacket: { ...it, itEmail: e.target.value } })} placeholder="helpdesk@district.org" />
        </Field>
        <Field label="Platform" hint={detecting ? "Checking your email domain…" : "Detected from your email domain"}>
          <div className="flex gap-2">
            <select className={inputCls} value={it.platform} onChange={(e) => st.set({ itPacket: { ...it, platform: e.target.value as Platform } })}>
              <option value="unknown">Not sure</option>
              <option value="google">Google Workspace</option>
              <option value="microsoft">Microsoft 365</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                setDetecting(true);
                const p = await detectPlatform(st.profile.coordinatorEmail);
                st.set({ itPacket: { ...useStore.getState().itPacket, platform: p } });
                setDetecting(false);
              }}
            >
              Detect
            </Button>
          </div>
        </Field>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-accent">Preview the email</summary>
        <pre className="mt-2 max-h-80 overflow-y-auto rounded-lg bg-sunken p-3 text-xs whitespace-pre-wrap">{`Subject: ${text.subject}\n\n${text.body}`}</pre>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={async () => download("it-packet.pdf", await packetPdf(input))}>Download PDF</Button>
        {st.connection && st.connection.kind !== "demo" ? (
          <Button
            variant="primary"
            disabled={!it.itEmail}
            onClick={async () => {
              await st.sendInternal("it-packet", [it.itEmail!], text.subject, text.body);
              await markSent();
            }}
          >
            Send to IT
          </Button>
        ) : (
          <a href={mailto(text.subject, text.body)} onClick={() => it.itEmail && markSent()}>
            <Button variant="primary" disabled={!it.itEmail}>
              Open in my email
            </Button>
          </a>
        )}
        {it.sentAt && !it.approvedAt && (
          <Button
            variant="ghost"
            onClick={async () => {
              st.set({ itPacket: { ...it, approvedAt: new Date().toISOString() } });
              await st.log({ action: "it-packet", summary: "IT approved the connection" });
            }}
          >
            IT approved it
          </Button>
        )}
      </div>
      {followUp && (
        <div className="mt-4 rounded-lg bg-highlight p-3 text-sm text-highlight-fg">
          It's been {waited} school days. Here's a follow-up:{" "}
          <a className="font-medium underline" href={mailto(`Following up: ${text.subject}`, `Hi,\n\nFollowing up on the request below. It's about 30 minutes of setup, and I'm happy to get on a call.\n\nThanks,\n${input.coordinatorName}\n\n---\n${text.body}`)}>
            open follow-up draft
          </a>
        </div>
      )}
    </Card>
  );
}
