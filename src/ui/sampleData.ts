import { eventsFromIcs } from "../calendar/ics";
import { proposeYear } from "../calendar/extract";
import { buildStudents, type UploadKind } from "../ingest/buildStudents";
import { applyAnswer, proposeMapping } from "../ingest/mapColumns";
import { parseFile, parseCsvText } from "../ingest/parseFile";
import type { StaffMember, StaffRole } from "../agent/model";
import { useStore } from "../store/store";

const base = () => `${import.meta.env.BASE_URL}samples/`;

async function fetchBuf(name: string) {
  const r = await fetch(base() + name).catch(() => null);
  if (r?.ok) return r.arrayBuffer();
  // Some static hosts won't serve .xlsx; fall back to a base64 text copy.
  const b = await fetch(`${base()}${name}.b64.txt`).catch(() => null);
  if (!b?.ok) throw new Error(`Couldn't load sample ${name}`);
  return Uint8Array.from(atob((await b.text()).trim()), (c) => c.charCodeAt(0)).buffer;
}

export function parseStaffCsv(text: string): StaffMember[] {
  const sheet = parseCsvText(text);
  const [header, ...rows] = sheet.rows;
  const idx = (re: RegExp) => header.findIndex((h) => re.test(String(h ?? "").toLowerCase()));
  const [n, e, r, s, l] = [idx(/name/), idx(/mail/), idx(/role/), idx(/school|site/), idx(/lang/)];
  return rows
    .filter((row) => row[e])
    .map((row, i) => ({
      id: `staff_${i}`,
      name: String(row[n] ?? ""),
      email: String(row[e] ?? "").trim(),
      role: (String(row[r] ?? "other").trim() || "other") as StaffRole,
      school: row[s] ? String(row[s]) : undefined,
      languages: row[l] ? String(row[l]).split(/[;/]/).map((x) => x.trim()) : undefined,
    }));
}

/** One click: the whole session-0 setup with fictional sample data. */
export async function loadSampleData() {
  const st = useStore.getState();
  await st.updateProfile({
    district: "Sample Unified School District",
    coordinatorName: st.profile.coordinatorName || "Maria Lopez",
    coordinatorEmail: st.profile.coordinatorEmail || "mlopez@sample-unified.org",
    directorEmail: st.profile.directorEmail || "director@sample-unified.org",
    defaultLocation: "Lincoln Elementary, Room 4 (video link on request)",
  });
  for (const name of ["calendar-2026-27.ics", "calendar-2027-28.ics"]) {
    const text = new TextDecoder().decode(await fetchBuf(name));
    await useStore.getState().confirmYear({ ...proposeYear(eventsFromIcs(text), name).year, source: name });
  }
  const files: [string, UploadKind][] = [
    ["seis-export.csv", "seis"],
    ["my-tracker.xlsx", "tracker"],
  ];
  for (const [name, kind] of files) {
    const parsed = await parseFile(name, await fetchBuf(name));
    let mapping = proposeMapping(parsed);
    for (const q of [...mapping.questions]) {
      const answer = q.header === "Mtg Held" ? (q.sheetName === "Parent requests" ? "parentRequestMeetingHeld" : "evalMeetingHeld") : "ignore";
      mapping = applyAnswer(mapping, q, answer);
    }
    const r = buildStudents(parsed, mapping, { kind, uploadId: name, privacyLight: useStore.getState().settings.privacyLight });
    await useStore.getState().commitUpload({ fileName: name, kind, rowsRead: r.rowsRead, errors: r.errors }, r.students);
  }
  const staff = parseStaffCsv(new TextDecoder().decode(await fetchBuf("staff.csv")));
  await useStore.getState().setStaff(staff);
  await useStore.getState().useDemo();
  await useStore.getState().updateProfile({ onboarded: true });
}
