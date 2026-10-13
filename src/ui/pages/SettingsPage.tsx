import { useState } from "react";
import { buildDigest } from "../../agent/digest";
import type { Role, Settings } from "../../agent/model";
import { RULES_VERSION } from "../../rules/ca-rules";
import { useStore } from "../../store/store";
import { Badge, Button, Card, Field, inputCls, PageHeader } from "../components";
import { useDerived } from "../useDerived";

const NUMBERS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: "atRiskDays", label: "At-risk window (calendar days)", hint: "Spec: 30" },
  { key: "escalationSchoolDays", label: "Escalate when this many school days remain", hint: "Open question in the spec; default 10" },
  { key: "schedulingBufferSchoolDays", label: "Scheduling buffer N (school days before deadline)", hint: "Meetings are proposed at least N school days early" },
  { key: "assessorReportSchoolDays", label: "Report-writing days after testing", hint: "Sets assessors' finish-by date" },
  { key: "noticeLeadSchoolDays", label: "Earliest meeting (school days from today)", hint: "So the notice arrives in time" },
  { key: "parentReplyWaitSchoolDays", label: "Alert if parent hasn't replied after (school days)", hint: "" },
  { key: "meetingMinutes", label: "Meeting length (minutes)", hint: "" },
];

export function SettingsPage() {
  const st = useStore();
  const s = st.settings;
  const p = st.profile;
  const { queue, atRisk, today } = useDerived();
  const [confirmText, setConfirmText] = useState("");
  const num = (k: keyof Settings) => (
    <input type="number" min={0} className={inputCls} value={Number(s[k])} onChange={(e) => st.updateSettings({ [k]: Number(e.target.value) } as Partial<Settings>)} />
  );
  return (
    <div>
      <PageHeader title="Settings & privacy" subtitle={`Rules version ${RULES_VERSION}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="You">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className={inputCls} value={p.coordinatorName} onChange={(e) => st.updateProfile({ coordinatorName: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputCls} value={p.coordinatorEmail} onChange={(e) => st.updateProfile({ coordinatorEmail: e.target.value })} />
            </Field>
            <Field label="Phone (shown to parents)">
              <input className={inputCls} value={p.coordinatorPhone ?? ""} onChange={(e) => st.updateProfile({ coordinatorPhone: e.target.value })} />
            </Field>
            <Field label="District">
              <input className={inputCls} value={p.district} onChange={(e) => st.updateProfile({ district: e.target.value })} />
            </Field>
            <Field label="Director email (escalations)">
              <input className={inputCls} value={p.directorEmail ?? ""} onChange={(e) => st.updateProfile({ directorEmail: e.target.value })} />
            </Field>
            <Field label="Default meeting location">
              <input className={inputCls} value={p.defaultLocation} onChange={(e) => st.updateProfile({ defaultLocation: e.target.value })} />
            </Field>
            <Field label="Role on this device" hint="Viewers can see everything but can't approve, send or edit.">
              <select className={inputCls} value={p.role} onChange={(e) => st.setRole(e.target.value as Role)}>
                <option value="coordinator">Coordinator</option>
                <option value="director">Director</option>
                <option value="viewer">Viewer (read-only)</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Timelines & scheduling">
          <div className="grid gap-3 sm:grid-cols-2">
            {NUMBERS.map((n) => (
              <Field key={n.key} label={n.label} hint={n.hint}>
                {num(n.key)}
              </Field>
            ))}
            <Field label="Meetings from">
              <input type="time" className={inputCls} value={s.dayStart} onChange={(e) => st.updateSettings({ dayStart: e.target.value })} />
            </Field>
            <Field label="Meetings until">
              <input type="time" className={inputCls} value={s.dayEnd} onChange={(e) => st.updateSettings({ dayEnd: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card title="Morning digest" subtitle="Emailed to you the first time you open the app each day, from your connected account.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.digestEnabled} onChange={(e) => st.updateSettings({ digestEnabled: e.target.checked })} /> Send me the digest
          </label>
          <Button
            size="sm"
            className="mt-3"
            disabled={!st.connection || !p.coordinatorEmail}
            onClick={() => {
              const d = buildDigest(queue, atRisk, st.students, today, window.location.href.split("#")[0]);
              st.sendInternal("digest", [p.coordinatorEmail], d.subject, d.body).catch(() => {});
            }}
          >
            Send today's digest now
          </Button>
        </Card>

        <Card title="Connections (from IT)" subtitle="IDs only; they aren't secrets. See the IT packet.">
          <div className="space-y-3">
            <Field label="Google OAuth client ID">
              <input className={inputCls} value={s.googleClientId ?? ""} onChange={(e) => st.updateSettings({ googleClientId: e.target.value.trim() })} />
            </Field>
            <Field label="Microsoft application (client) ID">
              <input className={inputCls} value={s.msClientId ?? ""} onChange={(e) => st.updateSettings({ msClientId: e.target.value.trim() })} />
            </Field>
            <Field label="Microsoft directory (tenant) ID" hint="Leave blank for any work account.">
              <input className={inputCls} value={s.msTenant ?? ""} onChange={(e) => st.updateSettings({ msTenant: e.target.value.trim() })} />
            </Field>
            <Field label="Help link for IT (optional)">
              <input className={inputCls} value={s.supportUrl ?? ""} onChange={(e) => st.updateSettings({ supportUrl: e.target.value.trim() })} />
            </Field>
          </div>
        </Card>

        <Card title="Privacy" subtitle="California student data standards.">
          <ul className="mb-4 space-y-1.5 text-sm">
            <li>✓ Student data stays in this browser (IndexedDB). There is no vendor server.</li>
            <li>✓ Student data is never used to train AI models.</li>
            <li>✓ Nothing goes to a family without a coordinator's approval, and every approval is logged.</li>
            <li>✓ A signed CA-NDPA is offered before sign-up (a document, outside this app).</li>
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={s.privacyLight} onChange={(e) => st.updateSettings({ privacyLight: e.target.checked })} />
            <span>
              <b>Privacy-light mode.</b> Future uploads keep only student IDs, dates, school, grade and home language. Use this before a data agreement is signed.
            </span>
          </label>
        </Card>

        <Card title="AI helpers (optional)" subtitle="Off by default. Your own Anthropic API key, kept in this browser.">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={s.aiEnabled} onChange={(e) => st.updateSettings({ aiEnabled: e.target.checked })} />
            <span>Suggest column mappings, and draft translations into languages without a built-in template. Only column headers, three sample values, or the message text are sent, never whole student records. A person reviews every translation before approving it.</span>
          </label>
          {s.aiEnabled && (
            <Field label="Anthropic API key">
              <input type="password" className={`${inputCls} mt-2`} value={s.anthropicKey ?? ""} onChange={(e) => st.updateSettings({ anthropicKey: e.target.value.trim() })} placeholder="sk-ant-…" />
            </Field>
          )}
        </Card>

        <Card title="Demo & testing">
          <Field label="Pretend today is" hint="For demos and training. Leave blank to use the real date.">
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={st.todayOverride ?? ""} onChange={(e) => st.set({ todayOverride: e.target.value || undefined })} />
              {st.todayOverride && <Badge color="amber">simulated</Badge>}
            </div>
          </Field>
        </Card>

        <Card className="border-danger/30" title="Delete all district data" subtitle="Removes every student, calendar, meeting and log entry from this browser. This can't be undone.">
          <p className="mb-2 text-sm">
            Type <b>DELETE</b> to confirm. Export the audit log first if you need to keep it.
          </p>
          <div className="flex gap-2">
            <input className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" />
            <Button variant="danger" disabled={confirmText !== "DELETE"} onClick={() => st.deleteAllData()}>
              Delete everything
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
