"use client";
// P1 owns. Sidebar links, grouped, with icons: marks the current page and closes the phone menu after a tap (Q7).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const ICONS: Record<string, IconName> = {
  "/dashboard": "dashboard", "/leads": "leads", "/recovery": "lifebuoy", "/inbox": "inbox",
  "/contacts": "users", "/companies": "building", "/opportunities": "target", "/lists": "bookmark", "/payments": "card",
  "/integrations": "plug", "/audit": "shield", "/settings/users": "userCog", "/settings/roles": "key",
  "/settings/fields": "sliders", "/settings/pipelines": "columns", "/settings/assignment": "shuffle", "/settings/calendar": "calendar",
};

const GROUPS: { title: string; match: (href: string) => boolean }[] = [
  { title: "Work", match: (h) => ["/dashboard", "/leads", "/recovery", "/inbox"].includes(h) },
  { title: "Customers", match: (h) => ["/contacts", "/companies", "/opportunities", "/lists", "/payments"].includes(h) },
  { title: "Workspace", match: () => true },
];

export function closeNav() {
  const t = document.getElementById("nav-toggle") as HTMLInputElement | null;
  if (t) t.checked = false;
}

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const used = new Set<string>();
  const groups = GROUPS.map((g) => {
    const list = items.filter((i) => !used.has(i.href) && g.match(i.href));
    list.forEach((i) => used.add(i.href));
    return { title: g.title, list };
  }).filter((g) => g.list.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">{g.title}</p>
          <ul className="space-y-0.5">
            {g.list.map((n) => {
              const active = path === n.href || path.startsWith(n.href + "/");
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={closeNav}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-emerald-50 text-emerald-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"}`}
                  >
                    {active && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-emerald-700" />}
                    <Icon name={ICONS[n.href] ?? "chevronRight"} className={`h-[18px] w-[18px] ${active ? "text-emerald-700" : "text-stone-400 group-hover:text-stone-600"}`} />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
