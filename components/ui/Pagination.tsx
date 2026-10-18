// P1 owns. Q9: big lists are paginated. Keeps other query params (search, view, pipeline).
import Link from "next/link";

export function Pagination({ page, total, pageSize, basePath, params }: {
  page: number; total: number; pageSize: number; basePath: string; params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${sp.toString()}`;
  };
  const link = "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700";
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-stone-600">Showing {from}–{to} of {total}</span>
      <span className="flex items-center gap-2">
        {page > 1 ? <Link className={link} href={href(page - 1)}>← Previous</Link> : <span className={`${link} opacity-40`} aria-disabled>← Previous</span>}
        <span className="text-stone-600">Page {page} of {pages}</span>
        {page < pages ? <Link className={link} href={href(page + 1)}>Next →</Link> : <span className={`${link} opacity-40`} aria-disabled>Next →</span>}
      </span>
    </nav>
  );
}
