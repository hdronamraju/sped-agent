import { useState } from "react";
import { importCalendarFile, importCalendarUrl } from "../calendar/importCalendar";
import type { ProposedYear } from "../calendar/extract";
import { mergedBreaks, schoolDaysInBreak, VACATION_THRESHOLD_SCHOOL_DAYS, type Break, type SchoolYear } from "../rules/schoolDays";
import { fmt, isValidISO } from "../rules/dates";
import { useStore } from "../store/store";
import { Badge, Button, Card, DropZone, Field, inputCls } from "./components";

/** P0-2: read a PDF, link or .ics; propose the breaks; coordinator confirms. */
export function CalendarImporter({ onDone }: { onDone?: () => void }) {
  const [proposal, setProposal] = useState<ProposedYear | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const confirmYear = useStore((s) => s.confirmYear);
  const settings = useStore((s) => s.settings);

  /** Optional: let Claude read a calendar the rules-based reader struggled with. Only calendar text is sent. */
  async function rereadWithAi() {
    if (!lastFile || !settings.anthropicKey) return;
    await run(async () => {
      const data = await lastFile.arrayBuffer();
      const lines = lastFile.name.toLowerCase().endsWith(".pdf") ? await (await import("../calendar/pdf")).pdfToLines(data) : new TextDecoder().decode(data).split("\n");
      const { extractBreaks } = await import("../ai/claude");
      const r = await extractBreaks(settings.anthropicKey!, lines.join("\n"), proposal?.year.id ?? "");
      if (!r) throw new Error("The AI helper couldn't read this calendar.");
      const y1 = Number(r.firstDay.slice(0, 4));
      return {
        year: { id: `${y1}-${String(y1 + 1).slice(2)}`, firstDay: r.firstDay, lastDay: r.lastDay, breaks: r.breaks, source: `${lastFile.name} (read by AI)` },
        events: [],
        warnings: ["Read by the AI helper. Check every date against the calendar before confirming."],
      };
    });
  }

  async function run(fn: () => Promise<ProposedYear>) {
    setBusy(true);
    setError(null);
    try {
      setProposal(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (proposal) {
    return (
      <YearEditor
        key={proposal.year.source ?? "manual"}
        proposal={proposal}
        onCancel={() => setProposal(null)}
        onAi={settings.aiEnabled && settings.anthropicKey && lastFile && !busy ? rereadWithAi : undefined}
        onConfirm={async (y) => {
          await confirmYear(y);
          setProposal(null);
          onDone?.();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <DropZone accept=".pdf,.ics,.html,.htm,.txt" label="Drop your district calendar" hint="PDF, .ics, or a saved web page. You'll confirm the breaks before anything is counted." onFiles={(fs) => {
          if (!fs[0]) return;
          setLastFile(fs[0]);
          run(async () => importCalendarFile(fs[0].name, await fs[0].arrayBuffer()));
        }} />
      <div className="flex gap-2">
        <input className={inputCls} placeholder="…or paste a link to the calendar" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Calendar link" />
        <Button disabled={!url || busy} onClick={() => run(() => importCalendarUrl(url))}>
          Read link
        </Button>
      </div>
      <button
        className="text-xs text-fg-muted underline decoration-dotted"
        onClick={() => setProposal({ year: { id: "2026-27", firstDay: "2026-08-13", lastDay: "2027-06-04", breaks: [] }, events: [], warnings: ["Entered by hand. Add each break and holiday."] })}
      >
        Enter it by hand instead
      </button>
      {busy && <p className="text-sm text-fg-muted">Reading calendar…</p>}
      {error && <p className="text-sm text-danger-fg">{error}</p>}
    </div>
  );
}

function YearEditor({ proposal, onConfirm, onCancel, onAi }: { proposal: ProposedYear; onConfirm: (y: SchoolYear) => void; onCancel: () => void; onAi?: () => void }) {
  const [y, setY] = useState<SchoolYear>(proposal.year);
  const valid = isValidISO(y.firstDay) && isValidISO(y.lastDay) && y.firstDay < y.lastDay && y.breaks.every((b) => isValidISO(b.start) && isValidISO(b.end) && b.start <= b.end);
  const setBreak = (i: number, b: Partial<Break>) => setY({ ...y, breaks: y.breaks.map((x, j) => (j === i ? { ...x, ...b } : x)) });
  const ignored = proposal.events.filter((e) => e.role === "ignore");
  const valids = y.breaks.filter((b) => isValidISO(b.start) && isValidISO(b.end) && b.start <= b.end);
  const merged = mergedBreaks({ ...y, breaks: valids });

  return (
    <Card title={`Confirm the ${y.id} calendar`} subtitle={`Found in ${proposal.year.source ?? "your entry"}. Check every date: deadlines are counted from this.`}>
      {proposal.warnings.map((w) => (
        <p key={w} className="mb-2 rounded-lg bg-highlight px-3 py-2 text-sm text-highlight-fg">
          {w}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="School year">
          <input className={inputCls} value={y.id} onChange={(e) => setY({ ...y, id: e.target.value })} />
        </Field>
        <Field label="First day of school">
          <input type="date" className={inputCls} value={y.firstDay} onChange={(e) => setY({ ...y, firstDay: e.target.value })} />
        </Field>
        <Field label="Last day of school">
          <input type="date" className={inputCls} value={y.lastDay} onChange={(e) => setY({ ...y, lastDay: e.target.value })} />
        </Field>
      </div>
      <h3 className="mt-6 mb-2 text-sm font-medium">Days with no school</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-fg-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Name</th>
              <th className="py-1 pr-2 font-medium">From</th>
              <th className="py-1 pr-2 font-medium">To</th>
              <th className="py-1 pr-2 font-medium">California clocks</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {y.breaks.map((b, i) => {
              // Holidays touching a break count as one vacation, as the clocks see it.
              const span = merged.find((m) => m.start <= b.start && b.end <= m.end);
              const n = span ? schoolDaysInBreak(span) : 0;
              const joined = !!span && (span.start !== b.start || span.end !== b.end);
              return (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    <input className={inputCls} value={b.name} onChange={(e) => setBreak(i, { name: e.target.value })} aria-label="Break name" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="date" className={inputCls} value={b.start} onChange={(e) => setBreak(i, { start: e.target.value })} aria-label="From" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="date" className={inputCls} value={b.end} onChange={(e) => setBreak(i, { end: e.target.value })} aria-label="To" />
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {n > VACATION_THRESHOLD_SCHOOL_DAYS ? (
                      <Badge color="violet">
                        Not counted ({n} school days{joined ? ", joined" : ""})
                      </Badge>
                    ) : (
                      <Badge>
                        Counted ({n} school day{n === 1 ? "" : "s"}
                        {joined ? ", joined" : ""})
                      </Badge>
                    )}
                  </td>
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => setY({ ...y, breaks: y.breaks.filter((_, j) => j !== i) })} aria-label="Remove">
                      ✕
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setY({ ...y, breaks: [...y.breaks, { name: "Holiday", start: y.firstDay, end: y.firstDay }] })}>
        + Add a day off
      </Button>
      <p className="mt-3 text-xs text-fg-muted">
        Vacations of more than 5 school days aren't counted by California clocks, and neither is summer. Holidays next to a break (even across a weekend) are joined with it. Shorter breaks still count.
      </p>
      {ignored.length > 0 && (
        <details className="mt-3 text-xs text-fg-muted">
          <summary className="cursor-pointer">Ignored {ignored.length} item(s) that look like school days (minimum days, events)</summary>
          <ul className="mt-1 list-disc pl-5">
            {ignored.map((e, i) => (
              <li key={i}>
                {fmt(e.start)}: {e.name}{" "}
                <button className="underline" onClick={() => setY({ ...y, breaks: [...y.breaks, { name: e.name, start: e.start, end: e.end }] })}>
                  it's a day off
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <Button variant="primary" disabled={!valid} onClick={() => onConfirm(y)}>
          Confirm calendar
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onAi && (
          <Button variant="ghost" onClick={onAi}>
            Missing something? Re-read with AI
          </Button>
        )}
      </div>
    </Card>
  );
}
