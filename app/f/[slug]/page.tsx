// P2 owns. Public lead form (F3.1). No login.
export default async function PublicForm({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main className="p-8">Public lead form for workspace “{slug}” — P2 builds this (F3.1).</main>;
}
