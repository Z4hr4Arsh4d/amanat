// P2 owns. Run with:  npx tsx worker/test-escalation.ts
// Proves F3.8: two escalations of the same overdue lead at the same moment move it exactly once.
// Uses its own throwaway workspace so it never touches real data.
import { prisma } from "@/lib/db";
import { escalate } from "@/lib/leads/escalate";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`ok  - ${msg}`);
}

async function main() {
  const tag = `test-esc-${Date.now()}`;
  const ws = await prisma.workspace.create({ data: { name: "Escalation test", slug: tag } });
  try {
    const mk = (name: string) =>
      prisma.user.create({ data: { workspaceId: ws.id, email: `${name}@${tag}.test`, name, passwordHash: "x", status: "AVAILABLE" } });
    const [hina, omar, sara] = await Promise.all([mk("Hina"), mk("Omar"), mk("Sara")]);
    await prisma.assignmentConfig.create({
      data: {
        workspaceId: ws.id, ackWindowSeconds: 60, backupUserId: omar.id, managerUserId: sara.id,
        levels: [{ type: "BACKUP", seconds: 60 }, { type: "MANAGER", seconds: 120 }],
      },
    });
    const contact = await prisma.contact.create({ data: { workspaceId: ws.id, name: "Test Customer", phone: "+923001110000" } });
    const lead = await prisma.lead.create({
      data: {
        workspaceId: ws.id, contactId: contact.id, source: "MANUAL", status: "ASSIGNED", ownerId: hina.id,
        assignedAt: new Date(Date.now() - 120_000), firstAssignedAt: new Date(Date.now() - 120_000),
        deadlineAt: new Date(Date.now() - 60_000), // overdue by a minute
      },
    });

    // Two workers at once, both holding the same version they read.
    const results = await Promise.all([escalate(ws.id, lead.id, lead.version), escalate(ws.id, lead.id, lead.version)]);
    assert(results.filter(Boolean).length === 1, "exactly one of two simultaneous escalations moved the lead");

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    assert(after.ownerId === omar.id, "lead moved to the backup person (Omar)");
    assert(after.escalationCount === 1, "escalationCount is 1");
    assert(after.deadlineAt !== null && after.deadlineAt > new Date(), "a new deadline was set in the future");
    const rows = await prisma.leadAssignment.count({ where: { leadId: lead.id, kind: "ESCALATION" } });
    assert(rows === 1, "exactly one ESCALATION assignment row");

    // A third attempt with the old version must do nothing.
    assert((await escalate(ws.id, lead.id, lead.version)) === false, "a stale version is ignored");
    console.log("\nAll checks passed.");
  } finally {
    try {
      await prisma.workspace.delete({ where: { id: ws.id } });
      console.log("cleaned up test data");
    } catch {
      // The audit log refuses deletes on purpose (F4.2), so the test workspace shell may remain.
      await prisma.lead.deleteMany({ where: { workspaceId: ws.id } });
      await prisma.contact.deleteMany({ where: { workspaceId: ws.id } });
      console.log(`cleanup note: audit entries cannot be deleted, so workspace "${tag}" was left in place (empty of leads).`);
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
