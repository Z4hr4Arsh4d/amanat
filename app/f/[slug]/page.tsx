// P2 owns. Public lead form (F3.1). No login.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ui } from "@/components/ui/styles";
import { LeadForm } from "./LeadForm";

export default async function PublicForm({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await prisma.workspace.findUnique({ where: { slug }, select: { name: true } });
  if (!ws) notFound();
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className={ui.h1}>Contact {ws.name}</h1>
      <p className={`${ui.muted} mb-4 mt-1`}>Leave your details and we will get back to you.</p>
      <LeadForm slug={slug} company={ws.name} />
    </main>
  );
}
