"use client";
// P1 owns.
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
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
        <div className="flex-1 space-y-1">
          <label htmlFor="new-role" className={ui.label}>New role name</label>
          <input id="new-role" required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} placeholder="e.g. Field technician" />
        </div>
        <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Create role</button>
      </form>
      {roles.length === 0 && <p className={ui.muted}>No roles yet. Create one above.</p>}
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
        <div className="flex-1 space-y-1">
          <label htmlFor={`rn-${role.id}`} className={ui.label}>Role name</label>
          <input id={`rn-${role.id}`} value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
        </div>
        <p className="text-sm text-stone-600">
          Used by {role.users} {role.users === 1 ? "person" : "people"}
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-stone-800">Permissions</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {perms.map((p) => {
            const cid = `p-${role.id}-${p.key}`;
            return (
              <div key={p.key} className="flex items-start gap-2 rounded-md border border-stone-200 p-2">
                <input
                  id={cid}
                  type="checkbox"
                  checked={checked.has(p.key)}
                  onChange={() => toggle(p.key)}
                  className="mt-0.5 h-4 w-4 accent-emerald-800 focus:ring-2 focus:ring-emerald-700"
                />
                <label htmlFor={cid} className="text-sm">
                  {p.label}
                  <span className="block text-xs text-stone-500">{p.key}</span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !dirty}
          className={ui.btnPrimary}
          onClick={() =>
            run(() => updateRole({ roleId: role.id, name, permissions: [...checked] }), { success: `Role "${name.trim()}" saved.` })
          }
        >
          {pending && <Spinner />} Save changes
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
          Delete role
        </button>
        {role.users > 0 && (
          <span className="text-xs text-stone-600">🔒 Can&apos;t delete while people use it. Move them first on the Users page.</span>
        )}
        {dirty && <span className="text-xs font-medium text-amber-800">● Unsaved changes</span>}
      </div>
    </li>
  );
}
