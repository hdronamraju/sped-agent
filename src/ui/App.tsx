import { useEffect } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "../store/store";
import { cx } from "./components";
import { useDerived } from "./useDerived";
import { TodayPage } from "./pages/TodayPage";
import { AtRiskPage } from "./pages/AtRiskPage";
import { ProcessPage } from "./pages/ProcessPage";
import { StudentsPage } from "./pages/StudentsPage";
import { StudentPage } from "./pages/StudentPage";
import { MeetingPage } from "./pages/MeetingPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { DataPage } from "./pages/DataPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { AuditPage } from "./pages/AuditPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WelcomePage } from "./pages/WelcomePage";
import { DirectorPage } from "./pages/DirectorPage";
import { useDigest } from "./useDigest";

export function App() {
  const loaded = useStore((s) => s.loaded);
  const load = useStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);
  if (!loaded) return <div className="grid h-full place-items-center text-fg-muted">Loading…</div>;
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function Shell() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const { queue, atRisk } = useDerived();
  useDigest();
  const approvals = useStore((s) => s.meetings.filter((m) => m.messages.some((x) => x.status === "draft") && !["held", "cancelled"].includes(m.status)).length);
  if (!onboarded) {
    return (
      <Routes>
        <Route path="*" element={<WelcomePage />} />
      </Routes>
    );
  }
  const nav = [
    { to: "/today", label: "Today", count: queue.filter((q) => q.severity !== "upcoming").length },
    { to: "/at-risk", label: "At risk", count: atRisk.overdue.length, tone: "red" },
    { to: "/process", label: "Process" },
    { to: "/meetings", label: "Meetings", count: approvals, tone: "amber", countLabel: "to approve" },
    { to: "/students", label: "Students" },
    { to: "/director", label: "Director view" },
    { to: "/audit", label: "Audit log" },
  ];
  const setup = [
    { to: "/data", label: "Upload data" },
    { to: "/calendar", label: "School calendar" },
    { to: "/connections", label: "Calendar & email" },
    { to: "/settings", label: "Settings & privacy" },
  ];
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="border-b border-line bg-sunken md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-fg text-raised">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4 4L19 7" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium">SpEd Agent</p>
            <p className="text-[11px] text-fg-muted">California IEP timelines</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-0.5 md:overflow-y-auto">
          {nav.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
          <p className="hidden px-3 pt-5 pb-1 text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase md:block">Setup</p>
          {setup.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
        <AgentStatus />
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <ErrorBanner />
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/at-risk" element={<AtRiskPage />} />
          <Route path="/process" element={<ProcessPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/meetings/:id" element={<MeetingPage />} />
          <Route path="/director" element={<DirectorPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({ to, label, count, tone, countLabel }: { to: string; label: string; count?: number; tone?: string; countLabel?: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx("flex shrink-0 items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-[13.5px] whitespace-nowrap", isActive ? "bg-raised font-medium text-fg shadow-card" : "text-fg-subtle hover:bg-hover hover:text-fg")
      }
    >
      {label}
      {!!count && (
        <span title={countLabel} className={cx("rounded-full px-1.5 font-mono text-[11px] tabular-nums", tone === "red" ? "bg-danger-soft text-danger-fg" : tone === "amber" ? "bg-highlight text-highlight-fg" : "bg-base text-fg-subtle ring-1 ring-inset ring-line")}>
          {count}
        </span>
      )}
    </NavLink>
  );
}

function AgentStatus() {
  const conn = useStore((s) => s.connection);
  const role = useStore((s) => s.profile.role);
  const today = useStore((s) => s.today)();
  const override = useStore((s) => s.todayOverride);
  const lastUpload = useStore((s) => s.uploads.at(-1));
  return (
    <div className="hidden space-y-1 border-t border-line px-5 py-4 text-[11px] text-fg-muted md:mt-auto md:block">
      <p>
        <span className={cx("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", conn ? "bg-accent" : "bg-line-strong")} />
        {conn ? (conn.kind === "demo" ? "Demo calendars" : `${conn.kind === "google" ? "Google" : "Microsoft"}: ${conn.account}`) : "Calendar not connected"}
      </p>
      <p>Data as of {lastUpload ? new Date(lastUpload.at).toLocaleDateString() : "no upload yet"}</p>
      <p>
        Today: {today}
        {override && " (simulated)"} · {role}
      </p>
    </div>
  );
}

function ErrorBanner() {
  const error = useStore((s) => s.error);
  const busy = useStore((s) => s.busy);
  const set = useStore.setState;
  return (
    <>
      {busy && <div className="fixed right-4 bottom-4 z-50 rounded-md bg-fg px-3 py-2 text-sm text-raised shadow-pop">{busy}</div>}
      {error && (
        <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-fg">
          <span>{error}</span>
          <button className="text-danger-fg hover:text-danger" onClick={() => set({ error: null })} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
