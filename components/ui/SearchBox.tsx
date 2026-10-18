// P1 owns. Plain GET form so search works without JavaScript and keeps the URL shareable.
import { ui } from "./styles";

export function SearchBox({ q, placeholder, hidden = {} }: { q: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form role="search" className="flex flex-col gap-2 sm:flex-row">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="q" className="sr-only">Search</label>
      <input id="q" name="q" defaultValue={q} placeholder={placeholder} className={ui.input} />
      <button className={ui.btn}>Search</button>
    </form>
  );
}
