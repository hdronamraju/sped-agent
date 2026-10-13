import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store/store";
import { Button, Card, Field, inputCls } from "../components";
import { Uploader } from "../Uploader";
import { CalendarImporter } from "../CalendarImporter";
import { loadSampleData } from "../sampleData";

/** Session 0: name → files → calendar → at-risk list, with no IT. */
export function WelcomePage() {
  const profile = useStore((s) => s.profile);
  const students = useStore((s) => s.students.length);
  const years = useStore((s) => s.calendar.years);
  const update = useStore((s) => s.updateProfile);
  const [step, setStep] = useState(profile.coordinatorEmail ? (students ? 2 : 1) : 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  async function sample() {
    setBusy(true);
    setErr(null);
    try {
      await loadSampleData();
      nav("/at-risk");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const steps = ["About you", "Your students", "School calendar"];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-fg text-raised">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4 4L19 7" />
            </svg>
          </div>
          <span className="font-medium">SpEd Agent</span>
        </div>
        <h1 className="font-serif text-[40px] leading-[1.1] font-normal tracking-[-0.01em] sm:text-[44px]">Every California IEP meeting on time, without the chase.</h1>
        <p className="mt-3 text-fg-muted">
          Upload the files you already have. In a few minutes you'll see who's overdue, who's close, and who isn't on your tracker. Every date shows its working, so you can check it.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={sample} disabled={busy}>
            {busy ? "Loading sample district…" : "Try it with sample data"}
          </Button>
          <span className="text-xs text-fg-muted">Fictional students. Nothing leaves your browser.</span>
        </div>
        {err && <p className="mt-2 text-sm text-danger-fg">{err}</p>}
      </div>

      <ol className="mb-6 flex gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={`flex-1 rounded-full px-3 py-1.5 text-center ${i === step ? "bg-raised font-medium text-fg shadow-card" : i < step ? "bg-accent-soft text-accent-soft-fg" : "bg-sunken text-fg-muted"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="About you" subtitle="Used to sign messages and the audit log.">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setStep(1);
            }}
          >
            <Field label="Your name">
              <input required className={inputCls} value={profile.coordinatorName} onChange={(e) => update({ coordinatorName: e.target.value })} />
            </Field>
            <Field label="Work email">
              <input required type="email" className={inputCls} value={profile.coordinatorEmail} onChange={(e) => update({ coordinatorEmail: e.target.value })} />
            </Field>
            <Field label="District">
              <input required className={inputCls} value={profile.district} onChange={(e) => update({ district: e.target.value })} />
            </Field>
            <Field label="Special ed director's email" hint="For escalations. Optional.">
              <input type="email" className={inputCls} value={profile.directorEmail ?? ""} onChange={(e) => update({ directorEmail: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button variant="primary" type="submit">
                Next
              </Button>
            </div>
          </form>
        </Card>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <Uploader />
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={!students} onClick={() => setStep(2)}>
              Next: school calendar
            </Button>
            <span className="text-sm text-fg-muted">{students} students loaded</span>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          {years.length > 0 && <p className="text-sm text-accent">Confirmed: {years.map((y) => y.id).join(", ")}. Add next year's too if you have it.</p>}
          <CalendarImporter />
          <Button
            variant="primary"
            disabled={!years.length}
            onClick={async () => {
              await update({ onboarded: true });
              nav("/at-risk");
            }}
          >
            Show my at-risk list
          </Button>
        </div>
      )}
    </div>
  );
}
