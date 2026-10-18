import { prisma } from "@/lib/db";
import type { Ctx } from "./session";

// Every model that has a workspaceId column. Queries through scoped(ctx) are
// automatically limited to the caller's workspace (F1.6 / Q2): a guessed id from
// another workspace simply isn't found → return 404.
const TENANT_MODELS = new Set([
  "User", "Role", "Invite", "Company", "Contact", "Pipeline", "Stage", "FieldDef", "Opportunity",
  "SavedList", "Activity", "AuditLog", "Lead", "LeadAssignment", "AssignmentConfig", "Notification",
  "Integration", "IntegrationEvent", "Conversation", "Message", "Payment", "Appointment",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate",
  "groupBy", "update", "updateMany", "delete", "deleteMany", "upsert",
]);

/**
 * Usage:  const db = scoped(ctx);  await db.contact.findMany({ where: { name: "x" } })
 * - adds `workspaceId` to every where
 * - sets `workspaceId` on every create
 * Use the raw `prisma` client ONLY in webhooks/worker, where you scope by hand.
 */
export function scoped(ctx: Pick<Ctx, "workspaceId">) {
  const workspaceId = ctx.workspaceId;
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = (args ?? {}) as any;
          if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), workspaceId };
          if (operation === "create" || operation === "upsert") {
            const key = operation === "create" ? "data" : "create";
            a[key] = { ...(a[key] ?? {}), workspaceId };
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d: any) => ({ ...d, workspaceId }));
          }
          return query(a);
        },
      },
    },
  });
}
