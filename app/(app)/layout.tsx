// P1 owns the shell. Nav items come from lib/shared/nav.ts (append-only).
import Link from "next/link";
import { Toaster } from "sonner";
import { requireUserPage, can } from "@/lib/core/session";
import { NAV } from "@/lib/shared/nav";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUserPage();
  const items = NAV.filter((n) => !n.perm || can(ctx, n.perm));
  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900 md:flex">
      <input id="nav-toggle" type="checkbox" className="peer sr-only" aria-label="Toggle navigation" />
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
        <span className="font-semibold text-emerald-800">AMANAT</span>
        <label htmlFor="nav-toggle" className="cursor-pointer rounded border border-stone-300 px-3 py-1 text-sm">Menu</label>
      </header>
      <nav
        aria-label="Main"
        className="hidden w-full flex-col border-r border-stone-200 bg-white p-4 peer-checked:flex md:flex md:w-60 md:shrink-0"
      >
        <span className="mb-4 hidden font-semibold tracking-wide text-emerald-800 md:block">AMANAT</span>
        <ul className="space-y-1">
          {items.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="block rounded px-3 py-2 text-sm hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t border-stone-200 pt-4 text-sm">
          <p className="font-medium">{ctx.name}</p>
          <p className="text-stone-600">{ctx.level}</p>
          <form action={logoutAction}>
            <button className="mt-2 underline">Log out</button>
          </form>
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
