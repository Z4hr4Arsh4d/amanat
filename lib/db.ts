import { PrismaClient } from "@prisma/client";

// Single Prisma client (survives Next.js hot reload in dev).
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
