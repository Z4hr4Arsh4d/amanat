// P1 owns. Q9: big lists are paginated. Keeps other query params (search, view, pipeline).
import Link from "next/link";
import { Icon } from "./Icon";
import { ui } from "./styles";

export function Pagination({ page, total, pageSize, basePath, params }: {
  page: number; total: number; pageSize: number; basePath: string; params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${sp.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const off = `${ui.btnSm} pointer-events-none opacity-40`;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-stone-600">
        Showing <span className="font-semibold tabular-nums text-stone-900">{from}–{to}</span> of <span className="font-semibold tabular-nums text-stone-900">{total}</span>
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          {page > 1 ? <Link className={ui.btnSm} href={href(page - 1)}><Icon name="chevronLeft" className="h-3.5 w-3.5" />Previous</Link> : <span className={off} aria-disabled="true"><Icon name="chevronLeft" className="h-3.5 w-3.5" />Previous</span>}
          <span className="px-1 tabular-nums text-stone-600">Page {page} of {pages}</span>
          {page < pages ? <Link className={ui.btnSm} href={href(page + 1)}>Next<Icon name="chevronRight" className="h-3.5 w-3.5" /></Link> : <span className={off} aria-disabled="true">Next<Icon name="chevronRight" className="h-3.5 w-3.5" /></span>}
        </span>
      )}
    </nav>
  );
}
