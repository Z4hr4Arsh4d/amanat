// P1 owns. Plain GET form so search works without JavaScript and keeps the URL shareable.
import { Icon } from "./Icon";
import { ui } from "./styles";

export function SearchBox({ q, placeholder, hidden = {} }: { q: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form role="search" className="flex gap-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="q" className="sr-only">Search</label>
      <div className="relative min-w-0 flex-1">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input id="q" name="q" type="search" defaultValue={q} placeholder={placeholder} className={`${ui.input} pl-9`} />
      </div>
      <button className={ui.btn}>Search</button>
    </form>
  );
}
