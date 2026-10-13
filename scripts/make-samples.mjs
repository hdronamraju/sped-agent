// Generates the sample files in public/samples/: a SEIS-style export, a coordinator's
// messy tracker workbook, a staff list, and 2026-27 / 2027-28 calendars (.ics + .pdf).
// All people are fictional; parent emails use the reserved example.com domain.
import { writeFileSync, mkdirSync } from "node:fs";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

const out = new URL("../public/samples/", import.meta.url);
mkdirSync(out, { recursive: true });
const p = (f) => new URL(f, out);

const SCHOOLS = ["Lincoln Elementary", "Washington Middle", "Roosevelt High"];
const us = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
};

// id, last, first, school, grade, cm, disability, lastAnnual, seisAnnualDue, lastTri, seisTriDue, parent, email, lang
const named = [
  ["1003", "Nguyen", "Ethan", 0, "4", "Ms. Rivera", "SLD", "2025-09-25", "2026-09-24", "2024-09-25", "2027-09-24", "Linh Nguyen", "linh.nguyen@example.com", "Vietnamese"],
  ["1006", "Brooks", "Maya", 0, "2", "Ms. Rivera", "SLI", "2025-10-20", "2026-10-19", "2025-10-20", "2028-10-19", "Dana Brooks", "dana.brooks@example.com", "English"],
  ["1007", "Kim", "Daniel", 1, "7", "Mr. Okafor", "OHI", "2025-10-28", "2026-10-30", "2023-10-28", "2026-10-27", "Grace Kim", "grace.kim@example.com", "Korean"],
  ["1008", "Lopez", "Isabella", 1, "6", "Mr. Okafor", "AUT", "2025-11-05", "2026-11-04", "2024-11-05", "2027-11-04", "Carmen Lopez", "carmen.lopez@example.com", "Spanish"],
  ["1009", "Smith", "Jayden", 2, "10", "Ms. Haddad", "ED", "2025-08-30", "2026-08-29", "2023-12-15", "2026-12-14", "Tom Smith", "tom.smith@example.com", "English"],
  ["1010", "Ramirez", "Lucia", 2, "11", "Ms. Haddad", "SLD", "2026-02-10", "2027-02-09", "2024-02-10", "2027-02-09", "Elena Ramirez", "elena.ramirez@example.com", "Spanish"],
  ["1011", "Patel", "Arjun", 0, "3", "Ms. Rivera", "SLI", "2025-11-18", "2026-11-17", "2024-11-18", "2027-11-17", "Priya Patel", "priya.patel@example.com", "English"],
  ["1012", "Okoye", "Zara", 1, "8", "Mr. Okafor", "SLD", "2025-12-03", "2026-12-02", "2024-01-10", "2027-01-09", "Ngozi Okoye", "ngozi.okoye@example.com", "English"],
];
const firsts = ["Noah", "Emma", "Liam", "Olivia", "Elijah", "Ava", "James", "Mia", "Benjamin", "Harper", "Lucas", "Evelyn", "Henry", "Abigail", "Alexander", "Emily", "Sebastian", "Ella", "Jack", "Camila", "Owen", "Aria", "Samuel", "Scarlett", "Leo", "Luna", "Ezra", "Nora"];
const lasts = ["Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Clark", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall"];
const langs = ["English", "English", "English", "Spanish", "English", "Spanish", "Tagalog", "English"];
const cms = [["Ms. Rivera"], ["Mr. Okafor"], ["Ms. Haddad"]];
const pad = (n) => String(n).padStart(2, "0");
const rows = [...named];
for (let i = 0; i < 28; i++) {
  const s = i % 3;
  // Annuals spread from Dec 2025 through Sep 2026, so dues fall across the coming year.
  const month = ((11 + i) % 12) + 1;
  const year = month >= 11 ? 2025 : 2026;
  const day = 1 + ((i * 7) % 27);
  const last = `${year}-${pad(month)}-${pad(day)}`;
  const dueY = year + 1;
  const due = new Date(Date.UTC(dueY, month - 1, day - 1)).toISOString().slice(0, 10);
  const triY = year - (i % 3);
  const tri = `${triY}-${pad(month)}-${pad(day)}`;
  const triDue = new Date(Date.UTC(triY + 3, month - 1, day - 1)).toISOString().slice(0, 10);
  const lang = langs[i % langs.length];
  rows.push([String(1020 + i), lasts[i], firsts[i], s, String([1, 4, 5, 6, 8, 9, 12][i % 7]), cms[s][0], ["SLD", "SLI", "OHI", "AUT"][i % 4], last, due, tri, triDue, `Parent of ${firsts[i]}`, `${firsts[i].toLowerCase()}.${lasts[i].toLowerCase()}.family@example.com`, lang]);
}

// SEIS export: report title rows, then headers; mixed date formats.
const seisHeader = ["Student ID", "Last Name", "First Name", "School of Attendance", "Grade", "Case Manager", "Primary Disability", "Last Annual IEP", "Annual Plan Review Due", "Last Triennial", "Triennial Due", "Parent/Guardian Name", "Parent Email", "Home Language"];
const csv = [
  "SEIS Caseload Report,Sample Unified School District",
  `Run date: 10/9/2026`,
  "",
  seisHeader.join(","),
  ...rows.map((r, i) => {
    const f = i % 5 === 0 ? (x) => x : us; // every fifth row uses ISO dates
    return [r[0], r[1], r[2], SCHOOLS[r[3]], r[4], r[5], r[6], f(r[7]), f(r[8]), f(r[9]), f(r[10]), r[11], r[12], r[13]].map((v) => (String(v).includes(",") ? `"${v}"` : v)).join(",");
  }),
].join("\r\n");
writeFileSync(p("seis-export.csv"), csv);

// Coordinator's tracker: an instructions tab, referrals with odd headers, parent requests.
const wb = new ExcelJS.Workbook();
const info = wb.addWorksheet("Read me");
info.addRow(["Maria's IEP tracker. Update every Friday."]);
info.addRow(["Yellow = waiting on parent"]);
const ref = wb.addWorksheet("Referrals 26-27");
ref.addRow(["Stu #", "Student Name", "School", "Ref Date", "AP Sent", "AP Signed", "Mtg Held", "Follow-up", "Parent", "Parent email", "Language", "Notes"]);
const D = (iso) => new Date(`${iso}T00:00:00Z`);
ref.addRow(["1001", "Leo Martinez", SCHOOLS[0], D("2026-09-28"), "10/6/2026", null, null, D("2026-10-13"), "Rosa Martinez", "rosa.martinez@example.com", "Spanish", "Mom asked for eval at conference"]);
ref.addRow(["1002", "Sofia Hernandez", SCHOOLS[0], D("2026-08-20"), D("2026-08-27"), "9/2/2026", null, D("2026-10-12"), "Ana Hernandez", "ana.hernandez@example.com", "Spanish", "Psych + SLP testing"]);
ref.addRow(["1004", "Ava Johnson", SCHOOLS[1], "Sep 21, 2026", null, null, null, null, "Kim Johnson", "kim.johnson@example.com", "English", "Need to send AP!"]);
ref.addRow(["1013", "Omar Haddad", SCHOOLS[2], D("2026-10-05"), null, null, null, null, "Sami Haddad", "sami.haddad@example.com", "Arabic", ""]);
ref.addRow(["1014", "Chloe Davis", SCHOOLS[1], D("2026-04-14"), D("2026-04-20"), D("2026-04-28"), D("2026-06-02"), null, "Pat Davis", "pat.davis@example.com", "English", "Found eligible"]);
ref.addRow([null, "New kid (no ID yet)", SCHOOLS[0], D("2026-10-08"), null, null, null, null, null, null, null, "Waiting on enrollment"]);
ref.addRow(["1015", "Wyatt Brown", SCHOOLS[2], "TBD", null, null, null, null, null, null, "English", "Teacher may refer"]);
const req = wb.addWorksheet("Parent requests");
req.addRow(["Student ID", "Parent Req Date", "Mtg Held", "What they asked"]);
req.addRow(["1005", D("2026-09-30"), null, "Wants to discuss behavior plan"]);
req.addRow(["1006", D("2026-08-25"), D("2026-09-15"), "Speech minutes"]);
await wb.xlsx.writeFile(p("my-tracker.xlsx").pathname);

// The parent-request student and two referral students also exist in SEIS where relevant.
// 1005 (Mateo Garcia) is in SEIS:
const seis2 = csv + "\r\n" + ["1005", "Garcia", "Mateo", SCHOOLS[1], "6", "Mr. Okafor", "OHI", "1/22/2026", "1/21/2027", "1/22/2026", "1/21/2029", "Luis Garcia", "luis.garcia@example.com", "Spanish"].join(",");
writeFileSync(p("seis-export.csv"), seis2);

// Staff directory.
const staff = [
  ["Name", "Email", "Role", "School", "Languages"],
  ["Dr. Priya Shah", "pshah@sample-unified.org", "school-psychologist", "", ""],
  ["Jordan Lee", "jlee@sample-unified.org", "speech-therapist", "", ""],
  ["Ms. Elena Rivera", "erivera@sample-unified.org", "sped-teacher", SCHOOLS[0], ""],
  ["Mr. Chidi Okafor", "cokafor@sample-unified.org", "sped-teacher", SCHOOLS[1], ""],
  ["Ms. Rania Haddad", "rhaddad@sample-unified.org", "sped-teacher", SCHOOLS[2], ""],
  ["Mr. Ben Carter", "bcarter@sample-unified.org", "gen-ed-teacher", SCHOOLS[0], ""],
  ["Ms. Sara Kim", "skim@sample-unified.org", "gen-ed-teacher", SCHOOLS[1], ""],
  ["Mr. Luis Ortega", "lortega@sample-unified.org", "gen-ed-teacher", SCHOOLS[2], ""],
  ["Principal Dana Ortiz", "dortiz@sample-unified.org", "administrator", SCHOOLS[0], ""],
  ["AP Marcus Green", "mgreen@sample-unified.org", "administrator", SCHOOLS[1], ""],
  ["AP Helen Wu", "hwu@sample-unified.org", "administrator", SCHOOLS[2], ""],
  ["Ana Gómez", "agomez@sample-unified.org", "interpreter", "", "Spanish"],
  ["Thanh Tran", "ttran@sample-unified.org", "interpreter", "", "Vietnamese"],
  ["Min-ji Park", "mpark@sample-unified.org", "interpreter", "", "Korean"],
];
writeFileSync(p("staff.csv"), staff.map((r) => r.join(",")).join("\r\n"));

// Calendars.
const y2627 = {
  id: "2026-27",
  first: "2026-08-13",
  last: "2027-06-03",
  breaks: [
    ["Labor Day", "2026-09-07", "2026-09-07"],
    ["Veterans Day", "2026-11-11", "2026-11-11"],
    ["Thanksgiving Break", "2026-11-23", "2026-11-27"],
    ["Winter Break", "2026-12-21", "2027-01-01"],
    ["Martin Luther King Jr. Day", "2027-01-18", "2027-01-18"],
    ["Lincoln Day", "2027-02-12", "2027-02-12"],
    ["Presidents' Day", "2027-02-15", "2027-02-15"],
    ["Cesar Chavez Day (observed)", "2027-03-26", "2027-03-26"],
    ["Spring Break", "2027-03-29", "2027-04-02"],
    ["Memorial Day", "2027-05-31", "2027-05-31"],
  ],
};
const y2728 = {
  id: "2027-28",
  first: "2027-08-12",
  last: "2028-06-01",
  breaks: [
    ["Labor Day", "2027-09-06", "2027-09-06"],
    ["Veterans Day", "2027-11-11", "2027-11-11"],
    ["Thanksgiving Break", "2027-11-22", "2027-11-26"],
    ["Winter Break", "2027-12-20", "2027-12-31"],
    ["Martin Luther King Jr. Day", "2028-01-17", "2028-01-17"],
    ["Presidents' Day", "2028-02-21", "2028-02-21"],
    ["Spring Break", "2028-03-27", "2028-03-31"],
    ["Memorial Day", "2028-05-29", "2028-05-29"],
  ],
};
const addDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
function ics(y) {
  const ev = (name, s, e, i) => ["BEGIN:VEVENT", `UID:${y.id}-${i}@sample-unified.org`, `DTSTART;VALUE=DATE:${s.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDay(e)}`, `SUMMARY:${name}`, "END:VEVENT"].join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sample Unified//Calendar//EN",
    ev("First Day of School", y.first, y.first, 0),
    ev("Back to School Night", y.id === "2026-27" ? "2026-09-03" : "2027-09-02", y.id === "2026-27" ? "2026-09-03" : "2027-09-02", 1),
    ...y.breaks.map((b, i) => ev(b[0], b[1], b[2], i + 2)),
    ev("Minimum Day", y.id === "2026-27" ? "2026-10-16" : "2027-10-15", y.id === "2026-27" ? "2026-10-16" : "2027-10-15", 98),
    ev("Last Day of School", y.last, y.last, 99),
    "END:VCALENDAR",
  ].join("\r\n");
}
writeFileSync(p("calendar-2026-27.ics"), ics(y2627));
writeFileSync(p("calendar-2027-28.ics"), ics(y2728));

// A PDF like districts post: one line per item, human date formats.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const human = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const doc = new jsPDF({ unit: "pt", format: "letter" });
doc.setFont("helvetica", "bold").setFontSize(16).text("Sample Unified School District", 54, 60);
doc.setFontSize(13).text("2026-27 Student Instructional Calendar", 54, 82);
doc.setFont("helvetica", "normal").setFontSize(11);
let y = 120;
const line = (t) => {
  doc.text(t, 54, y);
  y += 20;
};
line(`${human(y2627.first)} - First Day of School`);
for (const [name, s, e] of y2627.breaks) line(s === e ? `${human(s)} - ${name} (No School)` : `${human(s)} - ${human(e)}: ${name} (No School)`);
line("October 16, 2026 - Minimum Day");
line(`${human(y2627.last)} - Last Day of School`);
y += 10;
doc.setFontSize(9).text("Board approved March 2026. Dates subject to change.", 54, y);
writeFileSync(p("calendar-2026-27.pdf"), Buffer.from(doc.output("arraybuffer")));

console.log("samples written:", ["seis-export.csv", "my-tracker.xlsx", "staff.csv", "calendar-2026-27.ics", "calendar-2027-28.ics", "calendar-2026-27.pdf"].join(", "));
