import { detectSchoolYear, eventsFromText, htmlToLines, proposeYear, type ProposedYear } from "./extract";
import { eventsFromIcs } from "./ics";
import { pdfToLines } from "./pdf";

export async function importCalendarFile(fileName: string, data: ArrayBuffer): Promise<ProposedYear> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ics")) {
    return proposeYear(eventsFromIcs(new TextDecoder().decode(data)), fileName);
  }
  if (lower.endsWith(".pdf")) {
    return fromLines(await pdfToLines(data), fileName);
  }
  const text = new TextDecoder().decode(data);
  if (/BEGIN:VCALENDAR/.test(text)) return proposeYear(eventsFromIcs(text), fileName);
  if (/<html|<body|<table/i.test(text)) return fromLines(htmlToLines(text), fileName);
  return fromLines(text.split(/\n/), fileName);
}

export function fromLines(lines: string[], source: string): ProposedYear {
  const year = detectSchoolYear(lines.join(" ")) ?? new Date().getFullYear();
  return proposeYear(eventsFromText(lines, year), source);
}

/**
 * Fetch a calendar from a web link. District sites usually block cross-site
 * requests, so on failure we ask the coordinator to download and upload it.
 */
export async function importCalendarUrl(url: string): Promise<ProposedYear> {
  let res: Response;
  try {
    res = await fetch(url, { mode: "cors" });
  } catch {
    throw new Error(
      "This website doesn't let other sites read its calendar. Open the link, download the calendar (PDF or .ics) and upload it here instead.",
    );
  }
  if (!res.ok) throw new Error(`The link returned ${res.status}. Check the address, or download and upload the file.`);
  const type = res.headers.get("content-type") ?? "";
  const data = await res.arrayBuffer();
  const name = url.split("?")[0].split("/").pop() || "calendar";
  if (type.includes("pdf")) return importCalendarFile(`${name}.pdf`, data);
  if (type.includes("calendar")) return importCalendarFile(`${name}.ics`, data);
  return importCalendarFile(name.includes(".") ? name : `${name}.html`, data);
}
