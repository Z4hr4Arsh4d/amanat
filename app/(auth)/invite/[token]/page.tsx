// P1 owns. Public page opened from an invite link (F1.2).
import Link from "next/link";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/core/session";
import { AuthForm } from "../../AuthForm";
import { acceptInviteAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { workspace: true } });

  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return (
      <main className="grid min-h-dvh place-items-center bg-stone-50 px-4">
        <section role="alert" className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-stone-900">⚠ Invite not valid</h1>
          <p className="mt-2 text-sm text-stone-600">
            This link has expired or was already used. Ask your admin to send you a new invite.
          </p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-emerald-800 underline">Go to log in</Link>
        </section>
      </main>
    );
  }

  return (
    <AuthForm
      title={`Join ${inv.workspace.name}`}
      subtitle={`Invited as ${inv.email}. Remember your workspace "${inv.workspace.slug}" — you need it to log in.`}
      submit="Create my account"
      action={acceptInviteAction.bind(null, token)}
      fields={[
        { name: "name", label: "Your full name", autoComplete: "name" },
        { name: "password", label: "Choose a password (8+ characters)", type: "password", autoComplete: "new-password" },
      ]}
      footer={{ text: "Already have an account?", href: "/login", link: "Log in" }}
    />
  );
}
