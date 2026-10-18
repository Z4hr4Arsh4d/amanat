// P2 owns. Sample leads in every state for the demo: assigned, acknowledged, escalated twice,
// unassigned, owner-on-leave, overdue and idle. Timers are relative to the moment you run the seed.
import type { LeadSource, LeadStatus, PrismaClient } from "@prisma/client";

export async function seedLeads(prisma: PrismaClient, workspaceId: string) {
  const users = await prisma.user.findMany({ where: { workspaceId }, select: { id: true, email: true, name: true } });
  const by = (prefix: string) => users.find((u) => u.email.startsWith(`${prefix}@`));
  const hina = by("hina"), sara = by("sara"), ali = by("ali"), omar = by("manager");
  if (!hina || !sara || !ali || !omar) return; // not the standard demo workspace

  const cfg = await prisma.assignmentConfig.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
  const now = Date.now();
  const ago = (s: number) => new Date(now - s * 1000);
  const ahead = (s: number) => new Date(now + s * 1000);

  type Seed = {
    name: string; phone: string; source: LeadSource; status: LeadStatus; owner: { id: string; name: string } | null;
    deadline?: Date | null; acknowledged?: boolean; escalations?: number; onLeave?: boolean; lastAction?: Date; createdAgo: number;
    history: { from?: string; to?: string; kind: "AUTO" | "ESCALATION" | "ABSENCE" | "MANUAL"; level: number; reason: string }[];
  };

  const seeds: Seed[] = [
    {
      name: "Ahmed Raza", phone: "+923005550101", source: "WHATSAPP", status: "ASSIGNED", owner: hina, deadline: ahead(cfg.ackWindowSeconds), createdAgo: 5,
      history: [{ to: hina.id, kind: "AUTO", level: 0, reason: `Skipped ${ali.name} (On leave) · Chose ${hina.name} (next in rotation)` }],
    },
    {
      name: "Fatima Noor", phone: "+923005550102", source: "WEB_FORM", status: "ACKNOWLEDGED", owner: sara, acknowledged: true, lastAction: ago(60), createdAgo: 400,
      history: [{ to: sara.id, kind: "AUTO", level: 0, reason: `Chose ${sara.name} (next in rotation)` }],
    },
    {
      name: "Bilal Sheikh", phone: "+923005550103", source: "MANUAL", status: "ASSIGNED", owner: omar, deadline: ahead(120), escalations: 2, createdAgo: 300,
      history: [
        { to: hina.id, kind: "AUTO", level: 0, reason: `Chose ${hina.name} (next in rotation)` },
        { from: hina.id, to: sara.id, kind: "ESCALATION", level: 1, reason: `${hina.name} did not acknowledge within ${cfg.ackWindowSeconds}s (level 1 of 3) · Chose ${sara.name} (next in rotation)` },
        { from: sara.id, to: omar.id, kind: "ESCALATION", level: 3, reason: `${sara.name} did not acknowledge within 60s (level 3 of 3) · Sent to the manager, ${omar.name}` },
      ],
    },
    {
      name: "Zainab Malik", phone: "+923005550104", source: "WEB_FORM", status: "UNASSIGNED", owner: null, createdAgo: 200,
      history: [{ kind: "AUTO", level: 0, reason: "Nobody is free. Skipped everyone: not available or at the open-lead limit" }],
    },
    {
      name: "Usman Tariq", phone: "+923005550105", source: "WHATSAPP", status: "ACKNOWLEDGED", owner: ali, acknowledged: true, onLeave: true, lastAction: ago(900), createdAgo: 1200,
      history: [{ to: ali.id, kind: "AUTO", level: 0, reason: `Chose ${ali.name} (next in rotation)` }],
    },
    {
      name: "Hira Aslam", phone: "+923005550106", source: "WHATSAPP", status: "ASSIGNED", owner: hina, deadline: ago(180), createdAgo: 400, // overdue: shows in recovery until the worker escalates it
      history: [{ to: hina.id, kind: "AUTO", level: 0, reason: `Chose ${hina.name} (next in rotation)` }],
    },
    {
      name: "Kamran Butt", phone: "+923005550107", source: "MANUAL", status: "ACKNOWLEDGED", owner: sara, acknowledged: true, lastAction: ago(cfg.idleSeconds + 120), createdAgo: 1500, // idle
      history: [{ to: sara.id, kind: "AUTO", level: 0, reason: `Chose ${sara.name} (next in rotation)` }],
    },
  ];

  for (const s of seeds) {
    const contact = await prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone: s.phone } },
      create: { workspaceId, name: s.name, phone: s.phone }, update: {},
    });
    const created = ago(s.createdAgo);
    const lead = await prisma.lead.create({
      data: {
        workspaceId, contactId: contact.id, source: s.source, status: s.status, ownerId: s.owner?.id ?? null,
        createdAt: created, firstAssignedAt: s.owner ? created : null, assignedAt: s.owner ? created : null,
        deadlineAt: s.deadline ?? null,
        acknowledgedAt: s.acknowledged ? created : null, firstAcknowledgedAt: s.acknowledged ? created : null,
        escalationCount: s.escalations ?? 0, escalationLevel: s.escalations ? 3 : 0,
        lastActionAt: s.lastAction ?? null, ownerOnLeaveFlag: s.onLeave ?? false,
      },
    });
    for (const [i, h] of s.history.entries()) {
      await prisma.leadAssignment.create({
        data: {
          workspaceId, leadId: lead.id, fromUserId: h.from ?? null, toUserId: h.to ?? null, kind: h.kind, level: h.level, reason: h.reason,
          createdAt: new Date(created.getTime() + i * 60_000),
        },
      });
    }
    await prisma.activity.create({
      data: { workspaceId, contactId: contact.id, leadId: lead.id, type: "lead_created", summary: `New lead from ${s.source}`, createdAt: created },
    });
  }
}
