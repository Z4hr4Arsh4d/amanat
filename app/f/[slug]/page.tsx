// P2 owns. Public lead form (F3.1). No login.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LogoMark } from "@/components/ui/Logo";
import { LeadForm } from "./LeadForm";

export default async function PublicForm({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await prisma.workspace.findUnique({ where: { slug }, select: { name: true } });
  if (!ws) notFound();
  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-800 text-xl font-bold text-white">{ws.name.trim()[0]?.toUpperCase()}</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">Contact {ws.name}</h1>
          <p className="mt-1 text-sm text-stone-600">Leave your details and we will get back to you.</p>
        </div>
        <LeadForm slug={slug} company={ws.name} />
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-stone-500"><LogoMark className="h-4 w-4" />Powered by Amanat</p>
      </div>
    </main>
  );
}
