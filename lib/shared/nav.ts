// APPEND-ONLY. Sidebar items. `perm` hides the link (the page itself must still check on the server).
import type { Permission } from "./permissions";

export type NavItem = { href: string; label: string; perm?: Permission; owner: "P1" | "P2" | "P3" };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", owner: "P2" },
  { href: "/leads", label: "Leads", owner: "P2" },
  { href: "/recovery", label: "Recovery queue", owner: "P2" },
  { href: "/inbox", label: "Inbox", owner: "P3" },
  { href: "/contacts", label: "Contacts", perm: "crm.view", owner: "P1" },
  { href: "/companies", label: "Companies", perm: "crm.view", owner: "P1" },
  { href: "/opportunities", label: "Opportunities", perm: "crm.view", owner: "P1" },
  { href: "/lists", label: "Saved lists", perm: "crm.view", owner: "P2" },
  { href: "/payments", label: "Payments", owner: "P3" },
  { href: "/integrations", label: "Integrations", owner: "P3" },
  { href: "/audit", label: "Audit history", perm: "audit.view", owner: "P1" },
  { href: "/settings/users", label: "Users", perm: "users.manage", owner: "P1" },
  { href: "/settings/roles", label: "Roles", perm: "users.manage", owner: "P1" },
  { href: "/settings/fields", label: "Custom fields", perm: "pipeline.configure", owner: "P1" },
  { href: "/settings/pipelines", label: "Pipelines", perm: "pipeline.configure", owner: "P1" },
  { href: "/settings/assignment", label: "Assignment rules", perm: "assignment.manage", owner: "P2" },
  { href: "/settings/calendar", label: "My calendar", owner: "P3" },
];
