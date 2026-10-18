// P1 owns. Shown instead of a page when the user lacks the permission (the server still enforces it).
export function NoAccess({ what }: { what: string }) {
  return (
    <section role="alert" className="max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-6">
      <h1 className="text-xl font-semibold text-amber-900">⛔ No access</h1>
      <p className="mt-2 text-sm text-amber-900">
        You don&apos;t have permission to {what}. Ask your Owner or an Admin to add this permission to your role.
      </p>
    </section>
  );
}
