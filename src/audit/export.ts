import { fmt } from "../rules/dates";
import type { ClockResult } from "../rules/engine";
import { RULES_VERSION } from "../rules/ca-rules";
import type { Student } from "../types";
import type { AuditEntry } from "./log";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function studentTimelineCsv(s: Student, clocks: ClockResult[], log: AuditEntry[]): string {
  const rows: (string | number | undefined)[][] = [["type", "date", "item", "detail", "rule", "user", "rules version"]];
  for (const c of clocks) {
    rows.push(["deadline", c.dueDate, c.label, `${c.status}; act by ${c.actionBy}; start ${c.startDate}`, c.citation, "", c.rulesVersion]);
  }
  for (const e of log.filter((e) => e.studentId === s.id)) {
    rows.push(["action", e.at, e.action, e.summary, e.rule, e.user, e.rulesVersion]);
  }
  return toCsv(rows);
}

export function auditCsv(log: AuditEntry[]): string {
  return toCsv([
    ["seq", "time", "user", "action", "student", "clock", "rule", "rules version", "summary", "hash"],
    ...log.map((e) => [e.seq, e.at, e.user, e.action, e.studentId, e.clockId, e.rule, e.rulesVersion, e.summary, e.hash]),
  ]);
}

/** Per-student timeline PDF: every deadline with its working, then every logged action. */
export async function studentTimelinePdf(s: Student, clocks: ClockResult[], log: AuditEntry[], district: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = M;
  const line = (text: string, size = 10, bold = false, gap = 4) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const l of doc.splitTextToSize(text, W - 2 * M) as string[]) {
      if (y > doc.internal.pageSize.getHeight() - M) {
        doc.addPage();
        y = M;
      }
      doc.text(l, M, y);
      y += size + gap;
    }
  };
  line(`IEP timeline: student ${s.id}${s.name ? ` (${s.name})` : ""}`, 16, true, 8);
  line(`${district} · generated ${new Date().toLocaleString()} · rules ${RULES_VERSION}`, 9);
  y += 8;
  line("Deadlines", 13, true, 6);
  for (const c of clocks) {
    line(`${c.label}: due ${fmt(c.dueDate)} (act by ${fmt(c.actionBy)}) · ${c.status}`, 10, true);
    line(`${c.citation}`, 9);
    for (const w of c.working) line(`• ${w}`, 9, false, 2);
    for (const w of c.warnings) line(`! ${w}`, 9, false, 2);
    y += 6;
  }
  line("Actions", 13, true, 6);
  const entries = log.filter((e) => e.studentId === s.id);
  if (!entries.length) line("No actions logged yet.", 9);
  for (const e of entries) line(`${e.at.replace("T", " ").slice(0, 16)} · ${e.user} · ${e.action}: ${e.summary}${e.rule ? ` [${e.rule}]` : ""}`, 9, false, 2);
  return doc.output("blob");
}

export function download(name: string, data: Blob | string, type = "text/csv") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
