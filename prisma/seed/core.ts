// P1 owns. Two workspaces (to demo isolation), users with mixed levels/statuses, 2 pipelines,
// custom fields, 40 companies, 300 contacts, 80 opportunities, some history (PLAN §2.5).
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MANAGER_DEFAULT, SALES_DEFAULT } from "../../lib/shared/permissions";
import { computeHash } from "../../lib/audit";

// Small deterministic random generator so every seed run gives the same data.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const FIRST = ["Ahmed", "Fatima", "Ali", "Ayesha", "Usman", "Zainab", "Hamza", "Maryam", "Bilal", "Sana", "Omar", "Hira", "Saad", "Mahnoor", "Fahad", "Iqra", "Hassan", "Amna", "Talha", "Rabia", "Imran", "Noor", "Kashif", "Sadia", "Waqas", "Khadija", "Danish", "Mehwish", "Asad", "Laiba"];
const LAST = ["Khan", "Raza", "Malik", "Qureshi", "Sheikh", "Butt", "Chaudhry", "Siddiqui", "Hussain", "Javed", "Iqbal", "Ahmed", "Mirza", "Abbasi", "Shah", "Nawaz", "Akhtar", "Rana", "Aslam", "Bhatti"];
const CO_A = ["Green", "Sun", "Crescent", "Indus", "Margalla", "Ravi", "Pak", "Noor", "Al-Falah", "Zam Zam", "Karakoram", "Chenab", "Royal", "Star", "Prime", "Galaxy", "Unique", "Shaheen", "Mehran", "Kohinoor"];
const CO_B = ["Textiles", "Traders", "Builders", "Foods", "Motors", "Pharma", "Steel", "Estates", "Logistics", "Schools"];
const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar"];
const DEALS = ["5kW rooftop system", "10kW rooftop system", "Net metering setup", "Battery backup", "Factory solar plant", "Tubewell solar pump", "Office solar upgrade", "Hybrid inverter install"];

export async function seedCore(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash("password123", 12);
  const out = [];

  // The audit log refuses UPDATE/DELETE (F4.3), which also blocks wiping old demo workspaces.
  // Switch the guard off ONLY while deleting demo data, then straight back on.
  await prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER USER`);
  try {
    await prisma.workspace.deleteMany({ where: { slug: { in: ["sunrise-solar", "capital-realty"] } } });
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER USER`);
  }

  const specs = [
    { name: "Sunrise Solar", slug: "sunrise-solar", domain: "sunrise.test", contacts: 300, companies: 40, opps: 80, seed: 7 },
    { name: "Capital Realty", slug: "capital-realty", domain: "capital.test", contacts: 25, companies: 5, opps: 10, seed: 11 },
  ];

  for (const spec of specs) {
    const rand = rng(spec.seed);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
    const ws = await prisma.workspace.create({ data: { name: spec.name, slug: spec.slug } });
    const manager = await prisma.role.create({ data: { workspaceId: ws.id, name: "Manager", permissions: MANAGER_DEFAULT } });
    const sales = await prisma.role.create({ data: { workspaceId: ws.id, name: "Sales", permissions: SALES_DEFAULT } });
    const mk = (email: string, n: string, level: "OWNER" | "ADMIN" | "USER", roleId?: string, status: "AVAILABLE" | "BUSY" | "ON_LEAVE" | "OFFLINE" = "AVAILABLE") =>
      prisma.user.create({ data: { workspaceId: ws.id, email: `${email}@${spec.domain}`, name: n, passwordHash, level, roleId, status } });
    const owner = await mk("owner", "Ayesha Owner", "OWNER");
    const admin = await mk("admin", "Bilal Admin", "ADMIN");
    const mgr = await mk("manager", "Omar Manager", "USER", manager.id);
    const hina = await mk("hina", "Hina Khan", "USER", sales.id);
    const sara = await mk("sara", "Sara Ali", "USER", sales.id, "BUSY");
    const ali = await mk("ali", "Ali Raza", "USER", sales.id, "ON_LEAVE");
    const team = [owner, admin, mgr, hina, sara, ali];
    const sellers = [mgr, hina, sara, ali];

    // Pipelines (F2.3): default "Sales" + "Solar Installs" with its own fields.
    const salesP = await prisma.pipeline.create({ data: { workspaceId: ws.id, name: "Sales", isDefault: true } });
    const solarP = await prisma.pipeline.create({ data: { workspaceId: ws.id, name: "Solar Installs" } });

    // Custom fields (F2.2). "Roof size" is left out on purpose: add it live in the demo.
    const city = await prisma.fieldDef.create({ data: { workspaceId: ws.id, entity: "CONTACT", key: "city", label: "City", type: "DROPDOWN", options: CITIES, order: 0 } });
    await prisma.fieldDef.create({ data: { workspaceId: ws.id, entity: "COMPANY", key: "industry", label: "Industry", type: "TEXT", options: [], order: 0 } });
    const budget = await prisma.fieldDef.create({ data: { workspaceId: ws.id, entity: "OPPORTUNITY", key: "budget", label: "Budget", type: "NUMBER", options: [], order: 0 } });
    const kw = await prisma.fieldDef.create({ data: { workspaceId: ws.id, entity: "OPPORTUNITY", pipelineId: solarP.id, key: "system_size_kw", label: "System size (kW)", type: "NUMBER", options: [], order: 1 } });
    await prisma.fieldDef.create({ data: { workspaceId: ws.id, entity: "OPPORTUNITY", pipelineId: solarP.id, key: "panel_brand", label: "Panel brand", type: "DROPDOWN", options: ["Longi", "Jinko", "Canadian Solar", "JA Solar"], order: 2 } });

    const salesStages: [string, "OPEN" | "WON" | "LOST", string[]][] = [
      ["New", "OPEN", []], ["Qualified", "OPEN", []], ["Proposal", "OPEN", [budget.id]], ["Won", "WON", []], ["Lost", "LOST", []],
    ];
    const solarStages: [string, "OPEN" | "WON" | "LOST", string[]][] = [
      ["Site survey", "OPEN", []], ["Design", "OPEN", []], ["Installation", "OPEN", [kw.id]], ["Commissioned", "WON", []], ["Cancelled", "LOST", []],
    ];
    const mkStages = async (pipelineId: string, list: typeof salesStages) => {
      const created = [];
      for (const [i, [n, kind, req]] of list.entries()) {
        created.push(await prisma.stage.create({ data: { workspaceId: ws.id, pipelineId, name: n, kind, order: i, requiredFieldIds: req } }));
      }
      return created;
    };
    const sStages = await mkStages(salesP.id, salesStages);
    const pStages = await mkStages(solarP.id, solarStages);

    await prisma.assignmentConfig.create({
      data: { workspaceId: ws.id, ackWindowSeconds: 30, managerUserId: mgr.id, backupUserId: sara.id },
    });

    // Companies + contacts.
    await prisma.company.createMany({
      data: Array.from({ length: spec.companies }, (_, i) => ({
        workspaceId: ws.id, name: `${CO_A[i % CO_A.length]} ${CO_B[Math.floor(i / CO_A.length) % CO_B.length]}`,
        customFields: { industry: CO_B[Math.floor(i / CO_A.length) % CO_B.length] },
      })),
    });
    const companies = await prisma.company.findMany({ where: { workspaceId: ws.id }, select: { id: true } });
    const now = Date.now();
    await prisma.contact.createMany({
      data: Array.from({ length: spec.contacts }, (_, i) => {
        const first = pick(FIRST), last = pick(LAST);
        return {
          workspaceId: ws.id,
          name: `${first} ${last}`,
          phone: `+9230${(spec.seed === 7 ? 0 : 5) + (i % 5)}${String(1000000 + i * 7919).slice(-7)}`,
          email: rand() < 0.7 ? `${first}.${last}${i}@example.pk`.toLowerCase() : null,
          companyId: rand() < 0.6 ? pick(companies).id : null,
          ownerId: pick(sellers).id,
          tags: rand() < 0.2 ? ["vip"] : rand() < 0.3 ? ["rooftop"] : [],
          customFields: { [city.key]: pick(CITIES) },
          createdAt: new Date(now - Math.floor(rand() * 60) * 864e5),
        };
      }),
    });
    const contacts = await prisma.contact.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true, ownerId: true }, orderBy: { createdAt: "desc" } });

    // Opportunities across stages (75% Sales, 25% Solar Installs).
    const opps = Array.from({ length: spec.opps }, (_, i) => {
      const solar = i % 4 === 3;
      const stages = solar ? pStages : sStages;
      const stage = stages[Math.floor(rand() * stages.length)];
      const c = contacts[i % contacts.length];
      const value = Math.round((50_000 + rand() * 2_450_000) / 1000) * 1000;
      const idx = stages.indexOf(stage);
      const cf: Record<string, string | number> = {};
      if (idx >= 2 || rand() < 0.4) cf.budget = Math.round(value * (0.9 + rand() * 0.3));
      if (solar) {
        if (idx >= 2 || rand() < 0.5) cf.system_size_kw = 5 + Math.floor(rand() * 45);
        cf.panel_brand = pick(["Longi", "Jinko", "Canadian Solar", "JA Solar"]);
      }
      return {
        workspaceId: ws.id, pipelineId: solar ? solarP.id : salesP.id, stageId: stage.id, contactId: c.id,
        ownerId: c.ownerId, title: pick(DEALS), value, currency: rand() < 0.85 ? "PKR" : "USD", customFields: cf,
        closedAt: stage.kind === "OPEN" ? null : new Date(now - Math.floor(rand() * 20) * 864e5),
        createdAt: new Date(now - Math.floor(rand() * 45) * 864e5),
      };
    });
    await prisma.opportunity.createMany({ data: opps });

    // A little history so contact pages aren't empty (F2.8).
    const notes = ["Initial call: interested in rooftop solar.", "Sent brochure on WhatsApp.", "Customer asked for a site visit next week.", "Discussed net metering paperwork."];
    await prisma.activity.createMany({
      data: contacts.slice(0, 60).map((c, i) => ({
        workspaceId: ws.id, contactId: c.id, actorId: c.ownerId, type: "note", summary: notes[i % notes.length],
        createdAt: new Date(now - (i + 1) * 3_600_000),
      })),
    });

    // First audit entries, hash-chained exactly like lib/audit record().
    let prev = "GENESIS";
    const entries = [
      { action: "workspace.created", targetType: "Workspace", targetId: ws.id, after: { name: spec.name } },
      { action: "pipeline.created", targetType: "Pipeline", targetId: solarP.id, after: { name: "Solar Installs" } },
      { action: "field.created", targetType: "FieldDef", targetId: budget.id, after: { label: "Budget", type: "NUMBER" } },
      { action: "stage.updated", targetType: "Stage", targetId: sStages[2].id, before: { requiredFieldIds: [] }, after: { requiredFieldIds: [budget.id] } },
    ];
    for (const [i, e] of entries.entries()) {
      const createdAt = new Date(now - (entries.length - i) * 60_000);
      const row = {
        workspaceId: ws.id, seq: i + 1, actorId: owner.id, actorLabel: owner.name, action: e.action, targetType: e.targetType,
        targetId: e.targetId, before: e.before ?? null, after: e.after ?? null, createdAt,
      };
      const hash = computeHash(prev, row);
      await prisma.auditLog.create({
        data: { ...row, before: row.before ?? undefined, after: row.after ?? undefined, prevHash: prev, hash },
      });
      prev = hash;
    }

    void team;
    out.push(ws);
  }
  return out;
}
