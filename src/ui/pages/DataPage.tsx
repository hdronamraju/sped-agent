import { useStore } from "../../store/store";
import { Badge, Card, PageHeader } from "../components";
import { RowErrors, Uploader } from "../Uploader";
import { parseStaffCsv } from "../sampleData";
import { STAFF_ROLE_LABELS } from "../../agent/model";
import { DropZone } from "../components";

export function DataPage() {
  const uploads = useStore((s) => s.uploads);
  const staff = useStore((s) => s.staff);
  const setStaff = useStore((s) => s.setStaff);
  return (
    <div>
      <PageHeader title="Upload data" subtitle="Re-upload whenever you export from SEIS. Students are matched by ID; newer dates replace older ones. The date of the last upload is always shown." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Uploader />
        <div className="space-y-6">
          <Card title="Uploads">
            {uploads.length === 0 ? (
              <p className="text-sm text-fg-muted">None yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {[...uploads].reverse().map((u) => (
                  <li key={u.id}>
                    <p className="font-medium">
                      {u.fileName} <Badge>{u.kind}</Badge>
                    </p>
                    <p className="text-xs text-fg-muted">
                      {new Date(u.at).toLocaleString()} · {u.studentCount} students · {u.errors.length} issue(s)
                    </p>
                    {u.errors.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-accent">Show rows we couldn't read</summary>
                        <div className="mt-2">
                          <RowErrors errors={u.errors} />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Staff directory (${staff.length})`} subtitle="Used to fill required attendees. CSV with name, email, role, school, languages.">
            <DropZone accept=".csv" label="Upload staff CSV" onFiles={async (fs) => fs[0] && setStaff(parseStaffCsv(await fs[0].text()))} />
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs">
              {staff.map((p) => (
                <li key={p.id}>
                  <b>{p.name}</b> · {STAFF_ROLE_LABELS[p.role] ?? p.role}
                  {p.school && ` · ${p.school}`}
                  {p.languages && ` · ${p.languages.join(", ")}`}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
