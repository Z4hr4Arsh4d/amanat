// P1 owns the shell. Nav items come from lib/shared/nav.ts (append-only).
import Link from "next/link";
import { Toaster } from "sonner";
import { requireUserPage, can } from "@/lib/core/session";
import { prisma } from "@/lib/db";
import { NAV } from "@/lib/shared/nav";
import { NavLinks } from "@/components/ui/NavLinks";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Kit";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { LivePoller } from "./leads/LivePoller";
import { StatusSelector } from "./leads/StatusSelector";
import { logoutAction, logoutAllAction } from "../(auth)/actions";

const LEVEL = { OWNER: "Owner", ADMIN: "Admin", USER: "User" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUserPage();
  const items = NAV.filter((n) => !n.perm || can(ctx, n.perm));
  const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { name: true } });
  const live = can(ctx, "crm.view");

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <input id="nav-toggle" type="checkbox" className="peer sr-only" aria-label="Show the menu" />

      <aside
        aria-label="Sidebar"
        className="fixed inset-x-0 bottom-0 top-14 z-40 hidden flex-col overflow-y-auto border-r border-stone-200 bg-white peer-checked:flex md:sticky md:top-0 md:flex md:h-dvh"
      >
        <div className="hidden h-16 shrink-0 items-center px-5 md:flex">
          <Link href="/dashboard" className="rounded-lg"><Logo sub={ws?.name} /></Link>
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-4 md:pt-2">
          <NavLinks items={items.map((n) => ({ href: n.href, label: n.label }))} />
        </nav>
        {live && <div className="border-t border-stone-200 px-4 py-3 sm:hidden"><StatusSelector compact /></div>}
        <div className="shrink-0 border-t border-stone-200 p-3">
          <details className="group relative">
            <summary className="flex list-none items-center gap-3 rounded-lg p-2 hover:bg-stone-100">
              <Avatar name={ctx.name} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-bold text-stone-900">{ctx.name}</span>
                <span className="block truncate text-xs text-stone-500">{LEVEL[ctx.level]} · {ctx.email}</span>
              </span>
              <Icon name="chevronDown" className="chevron h-4 w-4 text-stone-400 transition-transform" />
              <span className="sr-only">Account menu</span>
            </summary>
            <div className="absolute inset-x-0 bottom-full mb-2 animate-fade-in rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
              <form action={logoutAction}>
                <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-800 hover:bg-stone-100">
                  <Icon name="logout" className="h-4 w-4 text-stone-500" /> Log out
                </button>
              </form>
              <form action={logoutAllAction}>
                <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-800 hover:bg-stone-100">
                  <Icon name="power" className="h-4 w-4 text-stone-500" /> Log out of all devices
                </button>
              </form>
            </div>
          </details>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/75 md:h-16 md:px-8">
          <label htmlFor="nav-toggle" className="-ml-1 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 md:hidden">
            <Icon name="menu" className="h-5 w-5" /> Menu
          </label>
          <Link href="/dashboard" className="flex items-center gap-2 rounded-lg md:hidden" aria-label="Amanat home">
            <LogoMark className="h-7 w-7" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {live && <div className="hidden sm:block"><StatusSelector compact /></div>}
            {live && <LivePoller />}
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </div>
  );
}
