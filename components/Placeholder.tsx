import { PageHeader } from "./ui/Kit";

export function Placeholder({ title, owner, reqs }: { title: string; owner: string; reqs: string }) {
  return <PageHeader title={title} description={`Owner: ${owner} · Requirements: ${reqs} · Replace this page.`} />;
}
