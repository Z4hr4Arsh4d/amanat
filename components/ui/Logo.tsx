// P1 owns. Amanat mark and wordmark.
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#104e41" />
      <path d="M9.5 23 16 8.5 22.5 23" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6 18h6.8" stroke="#7cc8ae" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ sub }: { sub?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark />
      <span className="min-w-0 leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight text-stone-900">Amanat</span>
        {sub && <span className="block truncate text-xs font-medium text-stone-500">{sub}</span>}
      </span>
    </span>
  );
}
