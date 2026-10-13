import { useState } from "react";
import { buildStudents, guessUploadKind, type BuildResult, type UploadKind } from "../ingest/buildStudents";
import { applyAnswer, fieldLabel, INFO_FIELD_LABELS, proposeMapping, type FieldKey, type FileMapping } from "../ingest/mapColumns";
import { parseFile, type ParsedFile } from "../ingest/parseFile";
import { useStore } from "../store/store";
import { DATE_FIELDS } from "../types";
import { Badge, Button, Card, DropZone, cx, inputCls } from "./components";

interface Pending {
  parsed: ParsedFile;
  mapping: FileMapping;
  kind: UploadKind;
}

const ALL_FIELDS: FieldKey[] = ["ignore", ...(Object.keys(INFO_FIELD_LABELS) as FieldKey[]), ...DATE_FIELDS.map((d) => d.key)];
const KIND_LABEL: Record<UploadKind, string> = { seis: "SEIS export", tracker: "My tracker", other: "Other list" };

/** P0-1: upload SEIS exports or trackers as-is. */
export function Uploader({ onDone }: { onDone?: () => void }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [results, setResults] = useState<{ fileName: string; result: BuildResult }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const commit = useStore((s) => s.commitUpload);
  const settings = useStore((s) => s.settings);

  async function onFiles(files: File[]) {
    setError(null);
    for (const f of files) {
      try {
        const parsed = await parseFile(f.name, await f.arrayBuffer());
        setPending((p) => [...p, { parsed, mapping: proposeMapping(parsed), kind: guessUploadKind(f.name) }]);
      } catch (e) {
        setError(`${f.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  function update(i: number, p: Partial<Pending>) {
    setPending((all) => all.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  async function importOne(i: number) {
    const p = pending[i];
    const r = buildStudents(p.parsed, p.mapping, { kind: p.kind, uploadId: p.parsed.fileName, privacyLight: settings.privacyLight });
    await commit({ fileName: p.parsed.fileName, kind: p.kind, rowsRead: r.rowsRead, errors: r.errors }, r.students);
    setResults((x) => [...x, { fileName: p.parsed.fileName, result: r }]);
    setPending((all) => all.filter((_, j) => j !== i));
    if (pending.length === 1) onDone?.();
  }

  return (
    <div className="space-y-4">
      <DropZone
        accept=".csv,.xlsx,.xlsm,.txt"
        onFiles={onFiles}
        label="Drop your SEIS export or tracking spreadsheet"
        hint="CSV or Excel, any column names, several tabs are fine. Student ID and dates are all we need; names are optional."
      />
      {error && <p className="text-sm text-danger-fg">{error}</p>}
      {pending.map((p, i) => (
        <MappingCard key={p.parsed.fileName + i} p={p} onChange={(x) => update(i, x)} onImport={() => importOne(i)} onCancel={() => setPending((all) => all.filter((_, j) => j !== i))} />
      ))}
      {results.map(({ fileName, result }) => (
        <Card key={fileName} title={`Imported ${fileName}`} subtitle={`${result.students.length} students from ${result.rowsRead} rows`}>
          {result.errors.length === 0 ? (
            <p className="text-sm text-accent">Every row was read.</p>
          ) : (
            <RowErrors errors={result.errors} />
          )}
        </Card>
      ))}
    </div>
  );
}

export function RowErrors({ errors }: { errors: BuildResult["errors"] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{errors.length} row issue(s). Fix them in the file and re-upload, or edit the student here.</p>
      <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
        {errors.map((e, i) => (
          <li key={i} className="flex gap-3 px-3 py-1.5">
            <span className="w-32 shrink-0 text-fg-muted">
              {e.sheet.length > 14 ? e.sheet.slice(0, 14) + "…" : e.sheet} row {e.row}
            </span>
            <span>
              {e.studentId && <b className="mr-1">{e.studentId}:</b>}
              {e.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MappingCard({ p, onChange, onImport, onCancel }: { p: Pending; onChange: (x: Partial<Pending>) => void; onImport: () => void; onCancel: () => void }) {
  const settings = useStore((s) => s.settings);
  const [aiBusy, setAiBusy] = useState(false);
  const q = p.mapping.questions[0];
  const hasId = p.mapping.sheets.some((s) => !s.skipped && s.columns.some((c) => c.field === "id"));

  function setField(sheet: string, index: number, field: FieldKey) {
    onChange({
      mapping: {
        ...p.mapping,
        sheets: p.mapping.sheets.map((s) => (s.sheetName !== sheet ? s : { ...s, columns: s.columns.map((c) => (c.index === index ? { ...c, field, how: "answered" as const } : c)) })),
        questions: p.mapping.questions.filter((x) => !(x.sheetName === sheet && x.columnIndex === index)),
      },
    });
  }

  async function askAi() {
    if (!settings.anthropicKey) return;
    setAiBusy(true);
    try {
      let mapping = p.mapping;
      for (const sheet of mapping.sheets) {
        const unmatched = sheet.columns.filter((c) => c.how === "unmatched");
        if (!unmatched.length) continue;
        const rows = p.parsed.sheets.find((s) => s.name === sheet.sheetName)!.rows.slice(sheet.headerRow + 1, sheet.headerRow + 4);
        const { suggestColumns } = await import("../ai/claude");
        const suggestions = await suggestColumns(
          settings.anthropicKey,
          unmatched.map((c) => ({ header: c.header, samples: rows.map((r) => String(r[c.index] ?? "")).filter(Boolean) })),
        );
        mapping = {
          ...mapping,
          sheets: mapping.sheets.map((s) => (s !== sheet ? s : { ...s, columns: s.columns.map((c) => (c.how === "unmatched" && suggestions[c.header] ? { ...c, field: suggestions[c.header] as FieldKey, how: "answered" as const } : c)) })),
        };
        mapping = { ...mapping, questions: mapping.questions.filter((x) => x.sheetName !== sheet.sheetName || x.kind === "id-column") };
      }
      onChange({ mapping });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Card
      title={p.parsed.fileName}
      subtitle={`${p.mapping.sheets.filter((s) => !s.skipped).length} tab(s) to read`}
      action={
        <div className="flex items-center gap-2">
          <select aria-label="File type" className={cx(inputCls, "w-auto py-1 text-xs")} value={p.kind} onChange={(e) => onChange({ kind: e.target.value as UploadKind })}>
            {(Object.keys(KIND_LABEL) as UploadKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {q && (
        <div className="mb-5 rounded-lg border border-accent-soft bg-accent-soft p-4">
          <p className="text-xs font-medium text-accent-soft-fg">
            Question {1} of {p.mapping.questions.length} (never more than 5)
          </p>
          <p className="mt-1 font-medium">{q.prompt}</p>
          {q.samples.length > 0 && <p className="mt-0.5 text-xs text-fg-muted">e.g. {q.samples.join(", ")}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <Button key={o.value} size="sm" variant={o.value === "ignore" ? "ghost" : "secondary"} onClick={() => onChange({ mapping: applyAnswer(p.mapping, q, o.value) })}>
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {p.mapping.sheets.map((s) => (
        <div key={s.sheetName} className="mb-4">
          {p.mapping.sheets.length > 1 && <p className="mb-1.5 text-xs font-medium text-fg-subtle">Tab: {s.sheetName}</p>}
          {s.skipped ? (
            <p className="text-xs text-fg-muted">Skipped: {s.skipped}</p>
          ) : (
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {s.columns
                .filter((c) => c.header.trim())
                .map((c) => (
                  <div key={c.index} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate" title={c.header}>
                      {c.header}
                    </span>
                    <span className="text-fg-muted">→</span>
                    <select
                      aria-label={`Field for ${c.header}`}
                      value={c.field}
                      onChange={(e) => setField(s.sheetName, c.index, e.target.value as FieldKey)}
                      className={cx("min-w-0 flex-1 rounded-md border px-2 py-1 text-xs", c.field === "ignore" ? "border-line text-fg-muted" : "border-accent-soft bg-accent-soft text-accent-soft-fg")}
                    >
                      {ALL_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {fieldLabel(f)}
                        </option>
                      ))}
                    </select>
                    {c.how === "auto" && <Badge color="green">auto</Badge>}
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="primary" disabled={!hasId} onClick={onImport}>
          Import {KIND_LABEL[p.kind].toLowerCase()}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {settings.aiEnabled && settings.anthropicKey && p.mapping.sheets.some((s) => s.columns.some((c) => c.how === "unmatched")) && (
          <Button variant="ghost" disabled={aiBusy} onClick={askAi}>
            {aiBusy ? "Asking…" : "Suggest the rest with AI (headers and 3 sample values only)"}
          </Button>
        )}
        {!hasId && <span className="text-xs text-danger-fg">Pick the student ID column first.</span>}
        {settings.privacyLight && <Badge color="violet">Privacy-light: names and contact details won't be stored</Badge>}
      </div>
    </Card>
  );
}
