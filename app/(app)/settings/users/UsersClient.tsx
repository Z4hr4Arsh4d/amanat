"use client";
// P1 owns.
import { useState } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { inviteUser, revokeInvite, updateUser } from "./actions";

type Level = "OWNER" | "ADMIN" | "USER";
type Status = "AVAILABLE" | "BUSY" | "ON_LEAVE" | "OFFLINE";
type U = { id: string; name: string; email: string; level: Level; roleId: string | null; status: Status; isActive: boolean };
type R = { id: string; name: string };
type I = { id: string; email: string; level: Level; expiresAt: Date };

const STATUS: Record<Status, string> = {
  AVAILABLE: "✓ Available",
  BUSY: "◐ Busy",
  ON_LEAVE: "✈ On leave",
  OFFLINE: "○ Offline",
};
const LEVEL: Record<Level, string> = { OWNER: "★ Owner", ADMIN: "◆ Admin", USER: "● User" };
const AWAY_POLICY =
  "Unacknowledged leads move to someone else right away. Leads already acknowledged stay with this person, but are flagged 'Owner away' and appear in the recovery queue so a manager can reassign them.";

export function UsersClient({ me, users, roles, invites }: { me: { id: string; level: Level }; users: U[]; roles: R[]; invites: I[] }) {
  return (
    <div className="space-y-6">
      <InviteForm roles={roles} me={me} />
      {invites.length > 0 && <PendingInvites invites={invites} />}
      <section aria-labelledby="team-h" className="space-y-3">
        <h2 id="team-h" className="text-lg font-semibold">Team ({users.length})</h2>
        <ul className="space-y-3">
          {users.map((u) => (
            <UserRow key={u.id} u={u} roles={roles} me={me} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function InviteForm({ roles, me }: { roles: R[]; me: { level: Level } }) {
  const { pending, run } = useAction();
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"ADMIN" | "USER">("USER");
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "");
  const [link, setLink] = useState<string | null>(null);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <section aria-labelledby="invite-h" className={ui.card}>
      <h2 id="invite-h" className="text-lg font-semibold">Invite someone</h2>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => inviteUser({ email, level, roleId: roleId || null }), {
            success: "Invite created. Copy the link and send it to them.",
            onSuccess: (d) => {
              setLink(window.location.origin + d.path);
              setEmail("");
            },
          });
        }}
      >
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="inv-email" className={ui.label}>Email</label>
          <input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={ui.input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="inv-level" className={ui.label}>Level</label>
          <select id="inv-level" value={level} onChange={(e) => setLevel(e.target.value as "ADMIN" | "USER")} className={ui.input}>
            <option value="USER">User</option>
            {me.level !== "USER" && <option value="ADMIN">Admin</option>}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="inv-role" className={ui.label}>Role</label>
          <select id="inv-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={ui.input} disabled={level === "ADMIN"}>
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <button disabled={pending} className={ui.btnPrimary}>
            {pending && <Spinner />} Create invite link
          </button>
        </div>
      </form>
      {link && (
        <div className="mt-4 space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <label htmlFor="inv-link" className="block text-sm font-medium text-emerald-900">
            Invite link (shown only once, valid for 7 days)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="inv-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={ui.input} />
            <button type="button" onClick={copy} className={ui.btn}>Copy link</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PendingInvites({ invites }: { invites: I[] }) {
  const { pending, run } = useAction();
  return (
    <section aria-labelledby="pending-h" className={ui.card}>
      <h2 id="pending-h" className="text-lg font-semibold">Waiting to join ({invites.length})</h2>
      <ul className="mt-2 divide-y divide-stone-200">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words text-sm">
              {i.email} · {LEVEL[i.level]} · expires {new Date(i.expiresAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              disabled={pending}
              className={ui.btnDanger}
              onClick={() => run(() => revokeInvite({ inviteId: i.id }), { success: "Invite cancelled." })}
            >
              Cancel invite
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UserRow({ u, roles, me }: { u: U; roles: R[]; me: { id: string; level: Level } }) {
  const { pending, run } = useAction();
  const [status, setStatus] = useState<Status>(u.status);
  const [level, setLevel] = useState<Level>(u.level);
  const [roleId, setRoleId] = useState<string>(u.roleId ?? "");

  const isSelf = u.id === me.id;
  const locked = (u.level === "OWNER" && me.level !== "OWNER") || (me.level === "USER" && u.level !== "USER");
  const lockReason = u.level === "OWNER" && me.level !== "OWNER"
    ? "Only the Owner can change the Owner's account."
    : locked ? "Only the Owner or an Admin can change an Admin." : null;

  function save(patch: Parameters<typeof updateUser>[0], revert: () => void, msg: string) {
    run(() => updateUser(patch), { success: msg, onError: revert });
  }

  return (
    <li className={`${ui.card} ${u.isActive ? "" : "opacity-70"}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="min-w-0 break-words font-medium">
          {u.name} {isSelf && <span className="text-sm text-stone-600">(you)</span>}
        </p>
        <p className="min-w-0 break-words text-sm text-stone-600">
          {u.email} · {LEVEL[u.level]} {!u.isActive && <span className="font-medium text-red-800">· ⊘ Deactivated</span>}
        </p>
      </div>
      {lockReason && <p className="mt-1 text-xs text-stone-600">🔒 {lockReason}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`lvl-${u.id}`} className={ui.label}>Level</label>
          {u.level === "OWNER" ? (
            <p id={`lvl-${u.id}`} className="py-2 text-sm">★ Owner (always exactly one)</p>
          ) : (
            <select
              id={`lvl-${u.id}`}
              value={level}
              disabled={pending || locked || isSelf}
              title={isSelf ? "You can't change your own level" : undefined}
              onChange={(e) => {
                const prev = level;
                const next = e.target.value as Level;
                setLevel(next);
                save({ userId: u.id, level: next as "ADMIN" | "USER" }, () => setLevel(prev), "Level updated.");
              }}
              className={ui.input}
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor={`role-${u.id}`} className={ui.label}>Role</label>
          <select
            id={`role-${u.id}`}
            value={roleId}
            disabled={pending || locked || u.level !== "USER"}
            onChange={(e) => {
              const prev = roleId;
              setRoleId(e.target.value);
              save({ userId: u.id, roleId: e.target.value || null }, () => setRoleId(prev), "Role updated.");
            }}
            className={ui.input}
          >
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {u.level !== "USER" && <p className="text-xs text-stone-600">Owners and Admins have every permission.</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor={`st-${u.id}`} className={ui.label}>Status</label>
          <select
            id={`st-${u.id}`}
            value={status}
            disabled={pending || locked || !u.isActive}
            onChange={(e) => {
              const prev = status;
              const next = e.target.value as Status;
              setStatus(next);
              save({ userId: u.id, status: next }, () => setStatus(prev), `Status set to ${STATUS[next].slice(2)}.`);
            }}
            className={ui.input}
          >
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS[s]}</option>
            ))}
          </select>
          {(status === "ON_LEAVE" || status === "OFFLINE") && <p className="text-xs text-stone-700">ℹ {AWAY_POLICY}</p>}
        </div>
      </div>

      {!isSelf && u.level !== "OWNER" && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={pending || locked}
            className={u.isActive ? ui.btnDanger : ui.btn}
            onClick={() => {
              if (u.isActive && !window.confirm(`Deactivate ${u.name}? They will be logged out and can't log in until reactivated.`)) return;
              save({ userId: u.id, isActive: !u.isActive }, () => {}, u.isActive ? `${u.name} deactivated.` : `${u.name} reactivated.`);
            }}
          >
            {pending && <Spinner />} {u.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}
    </li>
  );
}
