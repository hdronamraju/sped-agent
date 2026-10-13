import { GOOGLE_SCOPES, MS_SCOPES } from "../integrations/scopes";
import { SCOPES_EXPLAINED } from "../integrations/provider";

export type Platform = "google" | "microsoft" | "unknown";

/** Detect the district's email platform from its MX records (DNS over HTTPS). */
export async function detectPlatform(email: string): Promise<Platform> {
  const domain = email.split("@")[1];
  if (!domain) return "unknown";
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    const j = (await r.json()) as { Answer?: { data: string }[] };
    const mx = (j.Answer ?? []).map((a) => a.data.toLowerCase()).join(" ");
    if (/google|googlemail/.test(mx)) return "google";
    if (/outlook|microsoft/.test(mx)) return "microsoft";
  } catch {
    /* offline or blocked: ask the coordinator */
  }
  return "unknown";
}

export interface PacketInput {
  district: string;
  coordinatorName: string;
  coordinatorEmail: string;
  platform: Platform;
  appUrl: string;
  bookingUrl?: string;
}

const STEPS: Record<Platform, string[]> = {
  google: [
    "Google Cloud console → APIs & Services → enable the Google Calendar API and the Gmail API.",
    "OAuth consent screen → User type: Internal (only your district's accounts can sign in; no Google review needed).",
    `Credentials → Create OAuth client ID → Web application. Authorized JavaScript origin: APP_ORIGIN`,
    "Send the client ID (it is not a secret) to the coordinator. They paste it into Settings → Google client ID.",
    "Admin console → Security → API controls → App access control: mark the client ID as Trusted so staff aren't prompted.",
    "Admin console → Calendar → Sharing settings: let users in the district see free/busy for everyone else in the district (most districts already do).",
  ],
  microsoft: [
    "Microsoft Entra admin center → App registrations → New registration. Supported account types: this organization only.",
    "Authentication → Add a platform → Single-page application. Redirect URI: APP_URL",
    "API permissions → Microsoft Graph (delegated): User.Read, Calendars.ReadWrite, Calendars.Read.Shared, Mail.Send, Mail.ReadWrite → Grant admin consent.",
    "Send the Application (client) ID and Directory (tenant) ID to the coordinator. They paste them into Settings.",
    "Exchange admin: make sure free/busy sharing inside the organization is on (the default).",
  ],
  unknown: [
    "Tell the coordinator whether the district uses Google Workspace or Microsoft 365. This packet will update with the exact steps.",
  ],
};

export function packetText(p: PacketInput): { subject: string; body: string } {
  const origin = new URL(p.appUrl).origin;
  const steps = STEPS[p.platform].map((s, i) => `${i + 1}. ${s.replace("APP_ORIGIN", origin).replace("APP_URL", p.appUrl)}`).join("\n");
  const scopes = p.platform === "google" ? GOOGLE_SCOPES.join(", ") : p.platform === "microsoft" ? MS_SCOPES.join(", ") : "Calendar free/busy, create events, send mail, read replies";
  return {
    subject: `IT request: connect the IEP scheduling agent for ${p.district} (about 30 minutes)`,
    body: `Hi,

${p.coordinatorName} (${p.coordinatorEmail}) uses a scheduling assistant to keep IEP meetings within California's legal timelines. To book meetings without email back-and-forth, it needs to see staff free/busy times and send invitations from the coordinator's account. This is about 30 minutes of setup.

SUMMARY
• Platform: ${p.platform === "google" ? "Google Workspace" : p.platform === "microsoft" ? "Microsoft 365" : "not detected"}
• Runs in the coordinator's browser with their own sign-in. There is no vendor server holding district tokens.
• Read-only to SEIS. It writes only to calendars, email and its own audit log.

SETUP STEPS
${steps}

PERMISSIONS AND WHY
${SCOPES_EXPLAINED.map((s) => `• ${s.scope}: ${s.why}`).join("\n")}
Technical scopes: ${scopes}

PRIVACY
• Data used: student ID, IEP-related dates, school, and optionally parent name, email and home language.
• Stored in the coordinator's browser (IndexedDB). The district can delete everything with one button.
• Student data is never used to train AI models. Optional AI helpers are off by default and never receive whole student records.
• A signed California Student Data Privacy Agreement (CA-NDPA) is available.

SECURITY
• Sign-in through your SSO (Google or Microsoft). Tokens stay in session memory and expire.
• Every calculation, approval and message is in a tamper-evident audit log.
• Nothing is sent to a family without the coordinator's approval.

HELP
${p.bookingUrl ? `Book 15 minutes with our engineer: ${p.bookingUrl}` : "Reply to this email with any questions."}
App: ${p.appUrl}

Thank you,
${p.coordinatorName}`,
  };
}

export async function packetPdf(p: PacketInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { subject, body } = packetText(p);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 56;
  doc.setFont("helvetica", "bold").setFontSize(15);
  for (const l of doc.splitTextToSize(subject, W - 96) as string[]) {
    doc.text(l, 48, y);
    y += 19;
  }
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(10);
  for (const raw of body.split("\n")) {
    const heading = /^[A-Z ]{5,}$/.test(raw.trim());
    doc.setFont("helvetica", heading ? "bold" : "normal");
    for (const l of doc.splitTextToSize(raw || " ", W - 96) as string[]) {
      if (y > H - 48) {
        doc.addPage();
        y = 56;
      }
      doc.text(l, 48, y);
      y += 14;
    }
  }
  return doc.output("blob");
}
