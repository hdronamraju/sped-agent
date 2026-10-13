import { useState } from "react";
import { excludedSpans, sortedYears } from "../../rules/schoolDays";
import { fmt } from "../../rules/dates";
import { yearToIcs } from "../../calendar/ics";
import { download } from "../../audit/export";
import { useStore } from "../../store/store";
import { Badge, Button, Card, PageHeader } from "../components";
import { CalendarImporter } from "../CalendarImporter";

export function CalendarPage() {
  const cal = useStore((s) => s.calendar);
  const remove = useStore((s) => s.removeYear);
  const [confirming, setConfirming] = useState<string | null>(null);
  const spans = excludedSpans(cal);
  return (
    <div>
      <PageHeader title="School calendar" subtitle="Stored per school year. Upload next year's as soon as it's approved, so end-of-year deadlines are exact." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <CalendarImporter />
          {sortedYears(cal).map((y) => (
            <Card
              key={y.id}
              title={`${y.id}: ${fmt(y.firstDay)} to ${fmt(y.lastDay)}`}
              subtitle={`Confirmed by ${y.confirmedBy ?? "–"}${y.confirmedAt ? ` on ${new Date(y.confirmedAt).toLocaleDateString()}` : ""}${y.source ? ` · from ${y.source}` : ""}`}
              action={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => download(`calendar-${y.id}.ics`, yearToIcs(y), "text/calendar")}>
                    .ics
                  </Button>
                  {confirming === y.id ? (
                    <Button size="sm" variant="danger" onClick={() => remove(y.id)}>
                      Remove {y.id} and recalculate
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(y.id)}>
                      Remove
                    </Button>
                  )}
                </div>
              }
            >
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {y.breaks.map((b, i) => (
                  <li key={i}>
                    <span className="text-fg-muted tabular-nums">{b.start === b.end ? b.start : `${b.start} – ${b.end}`}</span> {b.name}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Card title="Days the clocks skip" subtitle="Summers and vacations longer than 5 school days.">
          {spans.length === 0 ? (
            <p className="text-sm text-fg-muted">Add a calendar first.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {spans.map((s) => (
                <li key={s.from}>
                  <p className="tabular-nums">
                    {s.from} – {s.to} {s.provisional && <Badge color="amber">estimated</Badge>}
                  </p>
                  <p className="text-xs text-fg-muted">{s.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
