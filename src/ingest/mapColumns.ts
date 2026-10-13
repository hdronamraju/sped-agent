import { DATE_FIELDS, type StudentDateField } from "../types";
import { looksLikeDate } from "./dates";
import type { Cell, ParsedFile, Sheet } from "./parseFile";

export type InfoField =
  | "id"
  | "name"
  | "firstName"
  | "lastName"
  | "school"
  | "grade"
  | "caseManager"
  | "disability"
  | "evalType"
  | "parentName"
  | "parentEmail"
  | "parentPhone"
  | "parentLanguage";

export type FieldKey = InfoField | StudentDateField | "ignore";

export const INFO_FIELD_LABELS: Record<InfoField, string> = {
  id: "Student ID",
  name: "Student name",
  firstName: "First name",
  lastName: "Last name",
  school: "School",
  grade: "Grade",
  caseManager: "Case manager",
  disability: "Disability",
  evalType: "Initial or triennial",
  parentName: "Parent name",
  parentEmail: "Parent email",
  parentPhone: "Parent phone",
  parentLanguage: "Home language",
};

export function fieldLabel(f: FieldKey): string {
  if (f === "ignore") return "Ignore this column";
  return (INFO_FIELD_LABELS as Record<string, string>)[f] ?? DATE_FIELDS.find((d) => d.key === f)?.label ?? f;
}

/** Header synonyms, most specific first. Matched against a normalized header. */
const SYNONYMS: [FieldKey, RegExp][] = [
  ["seisAnnualDue", /(annual|plan review|next iep|iep review).*(due|next)|(next|due).*(annual|plan review|iep)/],
  ["seisTriennialDue", /(tri|triennial|reeval|re eval|re evaluation).*(due|next)|(next|due).*(tri|reeval)/],
  ["parentRequestMeetingHeld", /(parent|family).*(request).*(meeting|iep).*(held|date held|completed)|request.*meeting held/],
  ["parentRequest", /(parent|family).*request|request.*(parent|family)|parent req/],
  ["evalMeetingHeld", /(initial|eval|evaluation|tri|triennial).*(iep|meeting).*(held|completed|date held)|eligibility meeting|initial iep date/],
  ["lastTriennial", /(last|most recent|prior).*(tri|triennial|reeval|re eval|evaluation)|^tri(ennial)?( date| iep)?$|triennial iep date|tri date|last eval/],
  ["lastAnnual", /(last|most recent|prior|current).*(annual|iep)|^annual( iep)?( date)?$|annual iep date|iep date|plan date|last meeting/],
  ["consent", /consent|signed.*(plan|assessment)|plan signed|ap signed|assessment plan (received|returned)/],
  ["planSent", /(plan|ap).*(sent|provided|given|mailed|issued)|assessment plan date|ap date/],
  ["referral", /referral|referred|ref date|date of referral/],
  ["parentEmail", /(parent|guardian|family|contact).*e ?mail|^e ?mail/],
  ["parentPhone", /(parent|guardian|family|contact).*(phone|cell|mobile|tel)|^(phone|cell|mobile)/],
  ["parentLanguage", /language|lang|idioma|home lang|primary lang/],
  ["parentName", /(parent|guardian|family|contact).*(name)|^(parent|guardian)s?$/],
  ["caseManager", /case ?manager|cm$|case mgr|teacher of record|provider/],
  ["evalType", /(eval|evaluation|assessment) type|initial or tri|^type$/],
  ["disability", /disability|eligibility|primary dis/],
  ["id", /(student|stu|ssid|seis|district|local|perm|sis).*(id|number|#|no)|^id$|^ssid$|^student$|statewide student id|^stu ?#$/],
  ["firstName", /first ?name|^first$|given name/],
  ["lastName", /last ?name|^last$|surname|family name/],
  ["name", /(student )?name|^student$/],
  ["school", /school|site|campus|location/],
  ["grade", /grade|^gr$|^gr\.?$/],
];

export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[_\-./()#:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessField(header: unknown): FieldKey | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  // "#" stripped above, so check the raw header for "Student #"-style IDs.
  if (/^(student|stu)\s*#$/i.test(String(header).trim())) return "id";
  for (const [field, re] of SYNONYMS) if (re.test(h)) return field;
  return null;
}

export interface ColumnMapping {
  index: number;
  header: string;
  field: FieldKey;
  how: "auto" | "answered" | "unmatched";
}

export interface SheetMapping {
  sheetName: string;
  headerRow: number; // 0-based index into sheet.rows
  columns: ColumnMapping[];
  skipped?: string; // reason the whole sheet was skipped
}

export interface Question {
  id: string;
  kind: "id-column" | "date-field";
  sheetName: string;
  columnIndex: number; // -1 for id-column questions
  header: string;
  prompt: string;
  samples: string[];
  /** id-column: column indexes as strings. date-field: field keys. */
  options: { value: string; label: string }[];
}

export interface FileMapping {
  fileName: string;
  sheets: SheetMapping[];
  questions: Question[];
}

export const MAX_QUESTIONS = 5;

function findHeaderRow(sheet: Sheet): number {
  let best = -1;
  let bestScore = 0;
  sheet.rows.slice(0, 15).forEach((row, i) => {
    const score = row.filter((c) => typeof c === "string" && guessField(c)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

function samplesFor(sheet: Sheet, headerRow: number, col: number): Cell[] {
  return sheet.rows
    .slice(headerRow + 1)
    .map((r) => r[col])
    .filter((c) => c !== null && c !== undefined && String(c).trim() !== "")
    .slice(0, 30);
}

function show(c: Cell): string {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c);
}

/** Map every sheet's columns, asking at most MAX_QUESTIONS questions for the whole file. */
export function proposeMapping(file: ParsedFile): FileMapping {
  const sheets: SheetMapping[] = [];
  const candidates: (Question & { priority: number })[] = [];

  for (const sheet of file.sheets) {
    const headerRow = findHeaderRow(sheet);
    if (headerRow < 0) {
      sheets.push({ sheetName: sheet.name, headerRow: 0, columns: [], skipped: "No recognizable column headers" });
      continue;
    }
    const header = sheet.rows[headerRow];
    const used = new Set<FieldKey>();
    const columns: ColumnMapping[] = header.map((h, index) => {
      const g = guessField(h);
      // First column wins when two headers map to the same field.
      if (g && !used.has(g)) {
        used.add(g);
        return { index, header: show(h ?? ""), field: g, how: "auto" as const };
      }
      return { index, header: show(h ?? `Column ${index + 1}`), field: "ignore" as const, how: "unmatched" as const };
    });
    // Data rows longer than the header row.
    const width = Math.max(...sheet.rows.slice(headerRow + 1, headerRow + 50).map((r) => r.length), header.length);
    for (let i = header.length; i < width; i++) columns.push({ index: i, header: `Column ${i + 1}`, field: "ignore", how: "unmatched" });

    const dateOptions = [...DATE_FIELDS.map((d) => d.key).filter((k) => !used.has(k)), "ignore" as const].map((k) => ({
      value: k,
      label: fieldLabel(k),
    }));

    if (!used.has("id")) {
      candidates.push({
        id: `${sheet.name}:id`,
        kind: "id-column",
        sheetName: sheet.name,
        columnIndex: -1,
        header: "",
        prompt: `Which column in "${sheet.name}" holds the student ID?`,
        samples: [],
        options: columns.map((c) => ({
          value: String(c.index),
          label: `${c.header}${samplesFor(sheet, headerRow, c.index).length ? ` (e.g. ${show(samplesFor(sheet, headerRow, c.index)[0])})` : ""}`,
        })),
        priority: 0,
      });
    }
    for (const c of columns) {
      if (c.how !== "unmatched") continue;
      const samples = samplesFor(sheet, headerRow, c.index);
      if (samples.length === 0) continue;
      const dateShare = samples.filter(looksLikeDate).length / samples.length;
      if (dateShare >= 0.6) {
        candidates.push({
          id: `${sheet.name}:${c.index}`,
          kind: "date-field",
          sheetName: sheet.name,
          columnIndex: c.index,
          header: c.header,
          prompt: `What date is "${c.header}"${file.sheets.length > 1 ? ` (tab "${sheet.name}")` : ""}?`,
          samples: samples.slice(0, 3).map(show),
          options: dateOptions,
          priority: 1 + (1 - dateShare),
        });
      }
    }
    sheets.push({ sheetName: sheet.name, headerRow, columns });
  }

  const questions = candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_QUESTIONS)
    .map(({ priority: _p, ...q }) => q);
  return { fileName: file.fileName, sheets, questions };
}

/** Apply an answer. For ID questions the answer is the column index as a string. */
export function applyAnswer(mapping: FileMapping, q: Question, answer: string): FileMapping {
  const sheets = mapping.sheets.map((s) => {
    if (s.sheetName !== q.sheetName) return s;
    const columns = s.columns.map((c) => {
      if (q.kind === "id-column") {
        return String(c.index) === answer ? { ...c, field: "id" as FieldKey, how: "answered" as const } : c;
      }
      return c.index === q.columnIndex ? { ...c, field: answer as FieldKey, how: "answered" as const } : c;
    });
    return { ...s, columns };
  });
  return { ...mapping, sheets, questions: mapping.questions.filter((x) => x.id !== q.id) };
}
