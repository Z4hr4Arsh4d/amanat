export function Placeholder({ title, owner, reqs }: { title: string; owner: string; reqs: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-stone-600">Owner: {owner} · Requirements: {reqs} · Replace this page.</p>
    </section>
  );
}
