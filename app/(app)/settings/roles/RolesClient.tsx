"use client";
// P1 owns.
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Kit";
import { createRole, deleteRole, updateRole } from "./actions";

type Role = { id: string; name: string; permissions: string[]; users: number };
type Perm = { key: string; label: string };

export function RolesClient({ roles, perms }: { roles: Role[]; perms: Perm[] }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="space-y-6">
      <form
        className={`${ui.card} flex flex-col gap-3 sm:flex-row sm:items-end`}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createRole({ name }), { success: `Role "${name.trim()}" created.`, onSuccess: () => setName("") });
        }}
      >
        <div className={`flex-1 ${ui.field}`}>
          <label htmlFor="new-role" className={ui.label}>New role name</label>
          <input id="new-role" required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} placeholder="e.g. Field technician" />
        </div>
        <button disabled={pending} className={ui.btnPrimary}>{pending ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}Create role</button>
      </form>
      {roles.length === 0 && <EmptyState icon="key" title="No roles yet">Create one above, then give it to people on the Users page.</EmptyState>}
      <ul className="space-y-4">
        {roles.map((r) => (
          <RoleCard key={`${r.id}:${r.name}:${r.permissions.join(",")}`} role={r} perms={perms} />
        ))}
      </ul>
    </div>
  );
}

function RoleCard({ role, perms }: { role: Role; perms: Perm[] }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(role.name);
  const [checked, setChecked] = useState<Set<string>>(new Set(role.permissions));
  const dirty =
    name.trim() !== role.name ||
    checked.size !== role.permissions.length ||
    role.permissions.some((p) => !checked.has(p));

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <li className={ui.card}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className={`flex-1 ${ui.field}`}>
          <label htmlFor={`rn-${role.id}`} className={ui.label}>Role name</label>
          <input id={`rn-${role.id}`} value={name} onChange={(e) => setName(e.target.value)} className={`${ui.input} sm:max-w-sm`} />
        </div>
        <p className="inline-flex items-center gap-1.5 pb-2.5 text-sm text-stone-600">
          <Icon name="users" className="h-4 w-4 text-stone-400" />Used by <span className="font-semibold tabular-nums text-stone-900">{role.users}</span> {role.users === 1 ? "person" : "people"}
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className={ui.label}>Permissions <span className="font-normal tabular-nums text-stone-500">({checked.size} of {perms.length})</span></legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {perms.map((p) => {
            const cid = `p-${role.id}-${p.key}`;
            return (
              <label key={p.key} htmlFor={cid} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${checked.has(p.key) ? "border-emerald-300 bg-emerald-50/60" : "border-stone-200 hover:bg-stone-50"}`}>
                <input
                  id={cid}
                  type="checkbox"
                  checked={checked.has(p.key)}
                  onChange={() => toggle(p.key)}
                  className={`${ui.check} mt-0.5`}
                />
                <span className="text-sm font-medium text-stone-900">
                  {p.label}
                  <span className="block font-mono text-[11px] font-normal text-stone-500">{p.key}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
        <button
          type="button"
          disabled={pending || !dirty}
          className={ui.btnPrimary}
          onClick={() =>
            run(() => updateRole({ roleId: role.id, name, permissions: [...checked] }), { success: `Role "${name.trim()}" saved.` })
          }
        >
          {pending && <Spinner />}Save changes
        </button>
        <button
          type="button"
          disabled={pending || role.users > 0}
          className={ui.btnDanger}
          onClick={() => {
            if (!window.confirm(`Delete the role "${role.name}"?`)) return;
            run(() => deleteRole({ roleId: role.id }), { success: `Role "${role.name}" deleted.` });
          }}
        >
          <Icon name="trash" className="h-4 w-4" />Delete role
        </button>
        {role.users > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-stone-600"><Icon name="lock" className="h-3.5 w-3.5" />Can&apos;t delete while people use it. Move them first on the Users page.</span>
        )}
        {dirty && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><Icon name="dot" className="h-3.5 w-3.5" />Unsaved changes</span>}
      </div>
    </li>
  );
}
