import { DATE_FIELDS, type Student, type StudentDateField } from "../types";
import { parseDate } from "./dates";
import { fieldLabel, type FileMapping } from "./mapColumns";
import type { Cell, ParsedFile } from "./parseFile";

export type UploadKind = "seis" | "tracker" | "other";

export interface RowError {
  sheet: string;
  row: number; // spreadsheet row number, 1-based, as the coordinator sees it
  studentId?: string;
  reason: string;
}

export interface BuildResult {
  students: Student[];
  errors: RowError[];
  rowsRead: number;
}

const DATE_KEYS = new Set<string>(DATE_FIELDS.map((d) => d.key));
const PII_FIELDS = new Set(["name", "firstName", "lastName", "parentName", "parentEmail", "parentPhone"]);

function text(c: Cell | undefined): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

export interface BuildOptions {
  kind: UploadKind;
  uploadId: string;
  /** Privacy-light mode: keep IDs, dates, school, grade, language; drop names and contact details. */
  privacyLight?: boolean;
}

export function buildStudents(file: ParsedFile, mapping: FileMapping, opts: BuildOptions): BuildResult {
  const byId = new Map<string, Student>();
  const errors: RowError[] = [];
  let rowsRead = 0;

  for (const sm of mapping.sheets) {
    if (sm.skipped) continue;
    const sheet = file.sheets.find((s) => s.name === sm.sheetName);
    if (!sheet) continue;
    const idCol = sm.columns.find((c) => c.field === "id");
    const mapped = sm.columns.filter((c) => c.field !== "ignore");
    if (!idCol) {
      errors.push({ sheet: sm.sheetName, row: sm.headerRow + 1, reason: "No student ID column, so this tab was skipped." });
      continue;
    }
    sheet.rows.slice(sm.headerRow + 1).forEach((row, i) => {
      const rowNum = sm.headerRow + 2 + i;
      if (row.every((c) => text(c) === "")) return;
      rowsRead++;
      const id = text(row[idCol.index]).replace(/\.0$/, "");
      if (!id) {
        errors.push({ sheet: sm.sheetName, row: rowNum, reason: "No student ID in this row." });
        return;
      }
      const s: Student = byId.get(id) ?? {
        id,
        dates: {},
        sources: [opts.uploadId],
        onTracker: opts.kind === "tracker",
        inSeis: opts.kind === "seis",
        exceptions: [],
      };
      let first = "";
      let last = "";
      for (const col of mapped) {
        const raw = row[col.index];
        const v = text(raw);
        if (!v || col.field === "id") continue;
        if (DATE_KEYS.has(col.field)) {
          const d = parseDate(raw);
          if (d) s.dates[col.field as StudentDateField] = d;
          else errors.push({ sheet: sm.sheetName, row: rowNum, studentId: id, reason: `Couldn't read "${v}" as a date (${fieldLabel(col.field)}). The rest of the row was imported.` });
          continue;
        }
        if (opts.privacyLight && PII_FIELDS.has(col.field)) continue;
        switch (col.field) {
          case "firstName": first = v; break;
          case "lastName": last = v; break;
          case "evalType": s.evalType = /tri|re ?eval/i.test(v) ? "triennial" : /init/i.test(v) ? "initial" : s.evalType; break;
          case "parentEmail":
            if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) s.parentEmail = v;
            else errors.push({ sheet: sm.sheetName, row: rowNum, studentId: id, reason: `"${v}" doesn't look like an email address.` });
            break;
          default:
            (s as unknown as Record<string, string>)[col.field] = v;
        }
      }
      if (!s.name && (first || last)) s.name = [first, last].filter(Boolean).join(" ");
      if (s.dates.consent && !s.evalType) s.evalType = s.dates.lastTriennial ? "triennial" : "initial";
      byId.set(id, s);
    });
  }
  return { students: [...byId.values()], errors, rowsRead };
}

/** Merge newly uploaded students into the existing roster. Newer non-empty values win. */
export function mergeStudents(existing: Student[], incoming: Student[]): Student[] {
  const map = new Map(existing.map((s) => [s.id, s]));
  for (const inc of incoming) {
    const cur = map.get(inc.id);
    if (!cur) {
      map.set(inc.id, inc);
      continue;
    }
    const merged: Student = {
      ...cur,
      ...Object.fromEntries(Object.entries(inc).filter(([, v]) => v !== undefined && v !== "")),
      dates: { ...cur.dates, ...inc.dates },
      sources: [...new Set([...cur.sources, ...inc.sources])],
      onTracker: cur.onTracker || inc.onTracker,
      inSeis: cur.inSeis || inc.inSeis,
      exceptions: cur.exceptions,
    };
    map.set(inc.id, merged);
  }
  return [...map.values()];
}

export function guessUploadKind(fileName: string): UploadKind {
  const f = fileName.toLowerCase();
  if (/seis|caseload|iep.?due|student.?list/.test(f)) return "seis";
  if (/track|referral|log|my/.test(f)) return "tracker";
  return "other";
}
