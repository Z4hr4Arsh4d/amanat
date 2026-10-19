// P1 owns. Public page opened from an invite link (F1.2).
import Link from "next/link";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/core/session";
import { AuthForm, AuthShell } from "../../AuthForm";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";
import { acceptInviteAction } from "../../actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { workspace: true } });

  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return (
      <AuthShell>
        <section role="alert" className="space-y-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-700"><Icon name="alert" className="h-6 w-6" /></span>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">This invite link doesn&apos;t work</h1>
          <p className="text-sm leading-6 text-stone-600">
            It has expired or was already used. Ask your admin to send you a new invite.
          </p>
          <Link href="/login" className={ui.btnPrimary}>Go to log in</Link>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthForm
      title={`Join ${inv.workspace.name}`}
      subtitle={`Invited as ${inv.email}. Remember your workspace "${inv.workspace.slug}" — you need it to log in.`}
      submit="Create my account"
      action={acceptInviteAction.bind(null, token)}
      fields={[
        { name: "name", label: "Your full name", autoComplete: "name", placeholder: "e.g. Ayesha Khan" },
        { name: "password", label: "Choose a password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
      ]}
      footer={{ text: "Already have an account?", href: "/login", link: "Log in" }}
    />
  );
}
