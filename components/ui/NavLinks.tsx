"use client";
// P1 owns. Sidebar links: marks the current page and closes the phone menu after a tap (Q7).
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const close = () => {
    const t = document.getElementById("nav-toggle") as HTMLInputElement | null;
    if (t) t.checked = false;
  };
  return (
    <ul className="space-y-1">
      {items.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={close}
              aria-current={active ? "page" : undefined}
              className={`block rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 ${active ? "bg-emerald-50 font-medium text-emerald-900" : "hover:bg-stone-100"}`}
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
