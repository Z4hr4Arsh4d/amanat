// P1 owns. Small building blocks shared by every page: page header, panels, badges, notices, empty states, avatars.
// Server-safe (no hooks), so both server pages and client components can use them.
import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import { ui } from "./styles";

export function PageHeader({ title, description, actions, back, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      {back && (
        <Link href={back.href} className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
          <Icon name="arrowLeft" className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className={`${ui.h1} break-words`}>{title}</h1>
          {description && <p className="max-w-3xl text-sm leading-6 text-stone-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A titled card. `flush` removes the inner padding (for lists that run edge to edge). */
export function Panel({ title, description, actions, children, id, flush, className = "" }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
  flush?: boolean;
  className?: string;
}) {
  const headingId = id ? `${id}-h` : undefined;
  return (
    <section aria-labelledby={headingId} className={`${ui.cardFlush} ${className}`}>
      {(title || actions) && (
        <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 ${flush ? "pb-4 border-b border-stone-200" : ""}`}>
          <div className="min-w-0">
            {title && <h2 id={headingId} className={ui.h2}>{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-stone-600">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : `px-5 pb-5 ${title || actions ? "pt-3" : "pt-5"}`}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "info";

const BADGE: Record<Tone, string> = {
  neutral: "border-stone-200 bg-stone-100 text-stone-700",
  brand: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

/** Status label: always text, optionally with an icon, so colour is never the only signal. */
export function Badge({ tone = "neutral", icon, children, title, className = "" }: { tone?: Tone; icon?: IconName; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={`${ui.badge} ${BADGE[tone]} ${className}`}>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

const NOTICE: Record<Exclude<Tone, "neutral" | "brand">, { box: string; icon: IconName; iconColor: string }> = {
  ok: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: "checkCircle", iconColor: "text-emerald-700" },
  warn: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: "alert", iconColor: "text-amber-700" },
  bad: { box: "border-red-200 bg-red-50 text-red-950", icon: "alertCircle", iconColor: "text-red-700" },
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: "info", iconColor: "text-sky-700" },
};

/** A message box for errors, warnings, success and tips. Errors get role="alert" so screen readers announce them. */
export function Notice({ tone = "info", title, children, className = "", role }: {
  tone?: Exclude<Tone, "neutral" | "brand">; title?: React.ReactNode; children?: React.ReactNode; className?: string; role?: "alert" | "status" | "note";
}) {
  const s = NOTICE[tone];
  return (
    <div role={role ?? (tone === "bad" ? "alert" : undefined)} className={`flex gap-3 rounded-lg border px-3.5 py-3 text-sm ${s.box} ${className}`}>
      <Icon name={s.icon} className={`mt-0.5 h-4 w-4 ${s.iconColor}`} />
      <div className="min-w-0 flex-1 space-y-1 break-words leading-6">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, children, action, compact }: { icon?: IconName; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "rounded-lg bg-stone-50/80 px-4 py-6" : "rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-12"}`}>
      <span className={`grid place-items-center rounded-full text-stone-500 ${compact ? "h-9 w-9 bg-white ring-1 ring-stone-200" : "h-11 w-11 bg-stone-100"}`}>
        <Icon name={icon} className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </span>
      <p className={`mt-3 text-sm ${compact ? "font-medium text-stone-600" : "font-semibold text-stone-900"}`}>{title}</p>
      {children && <div className="mt-1 max-w-md text-sm leading-6 text-stone-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR = [
  "bg-emerald-100 text-emerald-900", "bg-sky-100 text-sky-900", "bg-amber-100 text-amber-900",
  "bg-rose-100 text-rose-900", "bg-violet-100 text-violet-900", "bg-teal-100 text-teal-900", "bg-orange-100 text-orange-900",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const dims = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs";
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center rounded-full font-bold ${dims} ${AVATAR[h % AVATAR.length]}`}>
      {initials(name)}
    </span>
  );
}

/** Label / value pair for detail pages. */
export function Detail({ label, children, icon }: { label: string; children: React.ReactNode; icon?: IconName }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {icon && <Icon name={icon} className="h-3.5 w-3.5" />}{label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-stone-900">{children}</dd>
    </div>
  );
}

/** Summary row for a <details> that adds a record ("New contact"). */
export function AddSummary({ children }: { children: React.ReactNode }) {
  return (
    <summary className="flex list-none items-center gap-3 rounded-xl px-5 py-4 text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-50">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-800 text-white"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /></span>
      <span className="flex-1">{children}</span>
      <Icon name="chevronDown" className="chevron h-4 w-4 text-stone-500 transition-transform" />
    </summary>
  );
}
