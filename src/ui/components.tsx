import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ClockResult, ClockStatus } from "../rules/engine";
import { fmt } from "../rules/dates";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
        variant === "primary" &&
          "bg-accent text-accent-fg shadow-[0_0_0_1px_color-mix(in_oklch,var(--accent)_70%,black),inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.15)] hover:bg-accent-hover",
        variant === "secondary" && "bg-raised text-fg shadow-card hover:bg-hover",
        variant === "ghost" && "text-fg-subtle hover:bg-hover hover:text-fg",
        variant === "danger" && "bg-danger text-accent-fg hover:bg-danger-hover",
        className,
      )}
    />
  );
}

export function Card({ children, className, title, action, subtitle }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("min-w-0 rounded-lg bg-raised shadow-card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-[32px] leading-tight font-normal tracking-[-0.01em] sm:text-[36px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-fg-subtle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Status chips: done = hunter soft, attention = bone, past a legal deadline = danger, else neutral. */
const BADGE: Record<string, string> = {
  red: "bg-danger-soft text-danger-fg",
  amber: "bg-highlight text-highlight-fg",
  green: "bg-accent-soft text-accent-soft-fg",
  blue: "bg-sunken text-fg-subtle ring-1 ring-inset ring-line",
  gray: "bg-sunken text-fg-subtle ring-1 ring-inset ring-line",
  violet: "bg-highlight text-highlight-fg",
};
export function Badge({ color = "gray", children }: { color?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-px text-[11.5px] font-medium whitespace-nowrap", BADGE[color])}>{children}</span>;
}

export const STATUS_BADGE: Record<ClockStatus, { color: keyof typeof BADGE; label: string }> = {
  overdue: { color: "red", label: "Overdue" },
  "due-soon": { color: "amber", label: "Due soon" },
  "on-track": { color: "blue", label: "On track" },
  met: { color: "green", label: "Met" },
  "met-late": { color: "violet", label: "Met late" },
  waiting: { color: "gray", label: "Parent deciding" },
  "follow-up": { color: "amber", label: "Follow up" },
  exception: { color: "gray", label: "Exception" },
};

export function StatusBadge({ status }: { status: ClockStatus }) {
  const b = STATUS_BADGE[status];
  return <Badge color={b.color}>{b.label}</Badge>;
}

export function DaysLeft({ days }: { days: number }) {
  if (days < 0) return <span className="font-medium text-danger-fg">{-days}d overdue</span>;
  if (days === 0) return <span className="font-medium text-highlight-fg">today</span>;
  return <span className={days <= 10 ? "font-medium text-highlight-fg" : "text-fg-muted"}>{days}d left</span>;
}

/** A deadline with its working, which every date in the app can show. */
export function Working({ r }: { r: ClockResult }) {
  return (
    <div className="rounded-lg bg-sunken p-3 text-xs leading-relaxed text-fg-subtle">
      <ol className="list-decimal space-y-0.5 pl-4">
        {r.working.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ol>
      {r.warnings.map((w, i) => (
        <p key={i} className="mt-1.5 text-highlight-fg">
          ⚠ {w}
        </p>
      ))}
      <p className="mt-2 text-fg-muted">
        Rule:{" "}
        <a className="underline decoration-dotted hover:text-fg" href={r.citationUrl} target="_blank" rel="noreferrer">
          {r.citation}
        </a>{" "}
        · rules {r.rulesVersion}
      </p>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full min-w-0 rounded-md bg-raised px-3 py-1.5 text-sm text-fg shadow-card placeholder:text-fg-muted focus:outline-2 focus:outline-accent";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className={cx("m-auto w-[calc(100%-2rem)] rounded-xl bg-raised p-0 text-fg shadow-pop backdrop:bg-scrim", wide ? "max-w-3xl" : "max-w-lg")}>
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="font-serif text-[22px] font-normal">{title}</h3>
            <button onClick={onClose} className="rounded-sm p-1 text-fg-muted hover:bg-hover hover:text-fg" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-fg-muted">{children}</div>}
    </div>
  );
}

export function DropZone({ accept, onFiles, label, hint }: { accept: string; onFiles: (f: File[]) => void; label: string; hint?: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      onClick={() => input.current?.click()}
      className={cx("cursor-pointer rounded-lg border-2 border-dashed px-6 py-8 text-center transition", over ? "border-accent bg-accent-soft" : "border-line-strong bg-sunken hover:border-fg-muted")}
    >
      <p className="font-medium">{label}</p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
      <input ref={input} type="file" accept={accept} multiple className="hidden" data-testid="file-input" onChange={(e) => e.target.files && onFiles([...e.target.files])} />
    </div>
  );
}

export function DateText({ d }: { d?: string }) {
  return <span className="font-mono text-[12.5px] tabular-nums">{fmt(d)}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "red" | "amber" | "violet" | "default" }) {
  return (
    <div className="rounded-lg bg-raised px-4 py-3 shadow-card">
      <p className="text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase">{label}</p>
      <p className={cx("mt-1 font-serif text-[34px] leading-none tabular-nums", tone === "red" && "text-danger-fg", tone === "amber" && "text-highlight-fg", tone === "violet" && "text-highlight-fg")}>{value}</p>
    </div>
  );
}
