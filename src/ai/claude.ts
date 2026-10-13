import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DATE_FIELDS } from "../types";
import { INFO_FIELD_LABELS } from "../ingest/mapColumns";

/**
 * Optional AI helpers. Off by default; the coordinator brings their own
 * Anthropic API key, kept in this browser only. Only column headers, a few
 * sample values, calendar text and notice text are sent, never whole student
 * rows. Anthropic does not train on API data. Every helper has a non-AI fallback.
 */

const MODEL = "claude-opus-5-5";

function client(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function ensureNotRefused(r: { stop_reason: string | null }) {
  if (r.stop_reason === "refusal") throw new Error("The AI helper declined this request. Use the manual option instead.");
}

const FIELD_KEYS: [string, ...string[]] = ["ignore", ...Object.keys(INFO_FIELD_LABELS), ...DATE_FIELDS.map((d) => d.key)];

/** Suggest a field for columns the rules couldn't match. */
export async function suggestColumns(
  apiKey: string,
  columns: { header: string; samples: string[] }[],
): Promise<Record<string, string>> {
  const Schema = z.object({
    mappings: z.array(z.object({ header: z.string(), field: z.enum(FIELD_KEYS) })),
  });
  const fields = [
    ...Object.entries(INFO_FIELD_LABELS).map(([k, v]) => `${k}: ${v}`),
    ...DATE_FIELDS.map((d) => `${d.key}: ${d.label}`),
    "ignore: not needed for IEP timelines",
  ].join("\n");
  const r = await client(apiKey).messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Schema) },
    messages: [
      {
        role: "user",
        content: `These columns come from a California special education coordinator's spreadsheet (a SEIS export or their own tracker). Map each one to the best field, or "ignore".\n\nFields:\n${fields}\n\nColumns (header, then sample values):\n${columns
          .map((c) => `- "${c.header}": ${c.samples.slice(0, 3).join(" | ")}`)
          .join("\n")}`,
      },
    ],
  });
  ensureNotRefused(r);
  return Object.fromEntries((r.parsed_output?.mappings ?? []).map((m) => [m.header, m.field]));
}

/** Find breaks in calendar text the rules-based reader missed. */
export async function extractBreaks(apiKey: string, calendarText: string, schoolYear: string) {
  const Schema = z.object({
    firstDay: z.string().describe("YYYY-MM-DD"),
    lastDay: z.string().describe("YYYY-MM-DD"),
    breaks: z.array(z.object({ name: z.string(), start: z.string().describe("YYYY-MM-DD"), end: z.string().describe("YYYY-MM-DD, inclusive") })),
  });
  const r = await client(apiKey).messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(Schema) },
    messages: [
      {
        role: "user",
        content: `This is the text of a California school district's ${schoolYear} calendar. List the first and last day of instruction and every day or period with no school for students (holidays, breaks, non-student days). Use exact dates.\n\n${calendarText.slice(0, 60_000)}`,
      },
    ],
  });
  ensureNotRefused(r);
  return r.parsed_output;
}

/** Translate a parent message, keeping dates, times, names and legal references exact. */
export async function translate(apiKey: string, text: string, language: string): Promise<{ subject: string; body: string }> {
  const [subject, ...rest] = text.split("\n\n");
  const Schema = z.object({ subject: z.string(), body: z.string() });
  const r = await client(apiKey).messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(Schema) },
    messages: [
      {
        role: "user",
        content: `Translate this school message to a parent into ${language}. Use plain, warm language at about a 6th-grade reading level. Keep every date, time, name, email address, phone number and legal citation exactly as written. Keep the line structure.\n\nSUBJECT: ${subject.replace(/^SUBJECT: /, "")}\n\nBODY:\n${rest.join("\n\n")}`,
      },
    ],
  });
  ensureNotRefused(r);
  if (!r.parsed_output) throw new Error("Translation came back empty.");
  return r.parsed_output;
}
