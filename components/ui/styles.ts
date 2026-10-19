// P1 owns. Shared Tailwind class strings so every page looks the same and has visible focus rings (Q8).
// Colours come from the tokens in app/globals.css (stone = neutrals, emerald = brand).

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const btnBase =
  `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 select-none disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const secondary = "border border-stone-300 bg-white text-stone-800 shadow-xs hover:border-stone-400 hover:bg-stone-50 active:bg-stone-100";
const primary = "border border-emerald-800 bg-emerald-800 text-white shadow-xs hover:border-emerald-900 hover:bg-emerald-900 active:bg-emerald-950";
const inputCore =
  "block min-w-0 rounded-lg border border-stone-300 bg-white text-stone-900 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-600/15 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 aria-[invalid=true]:border-red-500";
const input = `${inputCore} px-3 py-[0.5625rem] text-sm leading-5`;
const danger = "border border-red-200 bg-white text-red-700 shadow-xs hover:border-red-300 hover:bg-red-50 focus-visible:ring-red-600";

export const ui = {
  // Surfaces
  card: "rounded-xl border border-stone-200 bg-white p-5 shadow-xs",
  cardFlush: "overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs",
  inset: "rounded-lg border border-stone-200 bg-stone-50 p-3",
  divider: "divide-y divide-stone-200",

  // Text
  h1: "text-2xl font-bold tracking-tight text-stone-900 sm:text-[1.7rem]",
  h2: "text-base font-bold tracking-tight text-stone-900",
  h3: "text-sm font-semibold text-stone-900",
  eyebrow: "text-xs font-semibold uppercase tracking-wider text-stone-500",
  muted: "text-sm text-stone-600",
  hint: "text-xs text-stone-600",
  link: "font-semibold text-emerald-800 underline decoration-emerald-800/30 underline-offset-2 hover:decoration-emerald-800 rounded-sm",
  num: "tabular-nums",

  // Forms
  label: "block text-sm font-semibold text-stone-800",
  labelSm: "block text-xs font-semibold text-stone-700",
  input: `w-full ${input}`,
  inputAuto: `w-auto ${input}`,
  inputSm: `w-auto ${inputCore} h-8 py-0 pl-2.5 text-[13px]`,
  field: "space-y-1.5",
  check: "h-4 w-4 shrink-0 rounded border-stone-300",

  // Buttons (40px tall; the *Sm versions are 32px for dense rows)
  btn: `${btnBase} h-10 px-3.5 ${secondary}`,
  btnPrimary: `${btnBase} h-10 px-4 ${primary}`,
  btnDanger: `${btnBase} h-10 px-3.5 ${danger}`,
  btnGhost: `${btnBase} h-10 px-3 text-stone-700 hover:bg-stone-100 hover:text-stone-900`,
  btnSm: `${btnBase} h-8 gap-1.5 px-2.5 text-xs ${secondary}`,
  btnPrimarySm: `${btnBase} h-8 gap-1.5 px-3 text-xs ${primary}`,
  btnDangerSm: `${btnBase} h-8 gap-1.5 px-2.5 text-xs ${danger}`,
  iconBtn: `${btnBase} h-10 w-10 ${secondary}`,

  // Small status labels
  badge: "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",

  // Lists that become tables on wide screens
  th: "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-stone-500",
  row: "transition-colors hover:bg-stone-50",
};
