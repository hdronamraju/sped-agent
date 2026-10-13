import { weekday } from "../rules/dates";
import type { Slot } from "./model";

export interface ParsedReply {
  choice: number | null; // 0-based index into the options
  none: boolean; // parent says none work
  confidence: "high" | "low";
  explanation: string;
}

const ORDINALS: [RegExp, number][] = [
  [/\b(first|primer[ao]?|1st|uno|option one|opci[oó]n\s*(a|uno))\b/i, 0],
  [/\b(second|segund[ao]|2nd|dos|option two|opci[oó]n\s*(b|dos))\b/i, 1],
  [/\b(third|tercer[ao]?|3rd|tres|option three|opci[oó]n\s*(c|tres))\b/i, 2],
];
const DAYS: [RegExp, number][] = [
  [/\b(monday|lunes)\b/i, 1],
  [/\b(tuesday|martes)\b/i, 2],
  [/\b(wednesday|mi[eé]rcoles)\b/i, 3],
  [/\b(thursday|jueves)\b/i, 4],
  [/\b(friday|viernes)\b/i, 5],
];
const NONE = /\b(none|neither|no (one|time|option)s? work|can'?t make (any|those)|ninguna?|no puedo|otro d[ií]a|other (time|day))\b/i;

/** Strip quoted history so we only read what the parent wrote. */
export function latestText(body: string): string {
  const cut = body.search(/^(>|On .+wrote:|El .+escribi[oó]:|-----Original|From: )/m);
  return (cut > 0 ? body.slice(0, cut) : body).trim();
}

/** Read a parent's reply to "reply 1, 2 or 3". Low-confidence results go to the coordinator. */
export function parseReply(body: string, options: Slot[]): ParsedReply {
  const text = latestText(body);
  const digits = [...text.matchAll(/(?:^|[^\d/:])([1-3])(?![\d/:])/g)].map((m) => Number(m[1]) - 1).filter((i) => i < options.length);
  const unique = [...new Set(digits)];
  if (unique.length === 1) return { choice: unique[0], none: false, confidence: "high", explanation: `Replied "${unique[0] + 1}".` };
  if (NONE.test(text)) return { choice: null, none: true, confidence: "high", explanation: "Parent says none of the times work." };
  for (const [re, i] of ORDINALS) if (re.test(text) && i < options.length) return { choice: i, none: false, confidence: "high", explanation: `Picked option ${i + 1}.` };
  for (const [re, wd] of DAYS) {
    if (re.test(text)) {
      const matches = options.map((o, i) => (weekday(o.date) === wd ? i : -1)).filter((i) => i >= 0);
      if (matches.length === 1) return { choice: matches[0], none: false, confidence: "high", explanation: `Named the day of option ${matches[0] + 1}.` };
    }
  }
  if (unique.length > 1) return { choice: null, none: false, confidence: "low", explanation: "Mentions more than one option. Please read and choose." };
  return { choice: null, none: false, confidence: "low", explanation: "Couldn't tell which time. Please read the reply." };
}
