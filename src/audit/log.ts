import { RULES_VERSION } from "../rules/ca-rules";

export type AuditAction =
  | "upload"
  | "calendar-confirmed"
  | "calculated"
  | "date-edited"
  | "exception-recorded"
  | "task-done"
  | "task-snoozed"
  | "meeting-created"
  | "times-proposed"
  | "message-approved"
  | "message-sent"
  | "parent-replied"
  | "calendar-hold"
  | "notice-approved"
  | "reschedule"
  | "escalated"
  | "meeting-held"
  | "connection"
  | "it-packet"
  | "settings"
  | "role-changed"
  | "data-deleted"
  | "export";

export interface AuditEntry {
  seq: number;
  at: string; // ISO timestamp
  user: string;
  action: AuditAction;
  summary: string;
  studentId?: string;
  clockId?: string;
  rule?: string; // citation
  rulesVersion: string;
  details?: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type NewAuditEntry = Omit<AuditEntry, "seq" | "at" | "rulesVersion" | "prevHash" | "hash"> & { at?: string };

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonical(e: Omit<AuditEntry, "hash">): string {
  return JSON.stringify([e.seq, e.at, e.user, e.action, e.summary, e.studentId ?? null, e.clockId ?? null, e.rule ?? null, e.rulesVersion, e.details ?? null, e.prevHash]);
}

/**
 * Append-only, hash-chained: each entry includes the previous entry's hash,
 * so any edit to history breaks the chain and shows up in verifyChain().
 */
export async function appendEntry(log: AuditEntry[], entry: NewAuditEntry): Promise<AuditEntry> {
  const prev = log.at(-1);
  const base: Omit<AuditEntry, "hash"> = {
    ...entry,
    seq: (prev?.seq ?? 0) + 1,
    at: entry.at ?? new Date().toISOString(),
    rulesVersion: RULES_VERSION,
    prevHash: prev?.hash ?? "genesis",
  };
  return { ...base, hash: await sha256(canonical(base)) };
}

export async function verifyChain(log: AuditEntry[]): Promise<{ ok: boolean; brokenAt?: number }> {
  let prev = "genesis";
  for (const e of log) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || (await sha256(canonical(rest))) !== hash) return { ok: false, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true };
}
