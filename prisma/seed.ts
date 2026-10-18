// Runs every part's seed. `npm run seed`. Each person owns their own file in prisma/seed/.
import { PrismaClient } from "@prisma/client";
import { seedCore } from "./seed/core";
import { seedLeads } from "./seed/leads";
import { seedIntegrations } from "./seed/integrations";

const prisma = new PrismaClient();

async function main() {
  const workspaces = await seedCore(prisma); // P1
  for (const ws of workspaces) {
    await seedLeads(prisma, ws.id); // P2
    await seedIntegrations(prisma, ws.id); // P3
  }
  console.log("Seed done. Log in with workspace 'sunrise-solar', owner@sunrise.test / password123");
}

main().finally(() => prisma.$disconnect());
