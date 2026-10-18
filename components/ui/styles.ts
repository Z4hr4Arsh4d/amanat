// P1 owns. Shared Tailwind class strings so every page looks the same and has visible focus rings (Q8).
export const ui = {
  card: "rounded-xl border border-stone-200 bg-white p-4 shadow-sm",
  label: "block text-sm font-medium text-stone-800",
  input:
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:bg-stone-100 disabled:text-stone-500",
  btn:
    "inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:cursor-not-allowed disabled:opacity-50",
  btnPrimary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  btnDanger:
    "inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 disabled:cursor-not-allowed disabled:opacity-50",
  h1: "text-2xl font-semibold text-stone-900",
  muted: "text-sm text-stone-600",
};
