// P1 owns. Shown instead of a page when the user lacks the permission (the server still enforces it).
import { Icon } from "./Icon";

export function NoAccess({ what }: { what: string }) {
  return (
    <section role="alert" className="mx-auto mt-6 max-w-lg rounded-xl border border-stone-200 bg-white p-8 text-center shadow-xs">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-700">
        <Icon name="lock" className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-lg font-bold text-stone-900">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        You don&apos;t have permission to {what}. Ask your Owner or an Admin to add this permission to your role.
      </p>
    </section>
  );
}
