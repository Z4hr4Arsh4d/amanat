// ─────────────────────────────────────────────────────────────────────────────
// CONTRACTS — the only functions you may call from another person's module.
// Import from here, e.g.  import { leads, timeline } from "@/lib/shared/contracts";
// Signatures never change without telling the whole team. Owners fill in the bodies.
// APPEND-ONLY.
// ─────────────────────────────────────────────────────────────────────────────
export { requireUser, requireUserPage, requirePermission, can, type Ctx } from "@/lib/core/session"; // P1
export { scoped } from "@/lib/core/scoped"; // P1
export * as audit from "@/lib/audit"; // P1: audit.record(), audit.verifyChain()
export * as timeline from "@/lib/crm/timeline"; // P1: timeline.add()
export * as leads from "@/lib/leads"; // P2: leads.intake(), leads.markActed(), leads.acknowledge(), leads.handleAbsence()
export * as notify from "@/lib/notify"; // P2: notify.alert()
export * as metrics from "@/lib/metrics"; // P2
export * as calendar from "@/lib/integrations/calendar"; // P3: calendar.isBusyNow()
export * as payments from "@/lib/integrations/payments"; // P3: payments.collected(), payments.projected()
export * as messaging from "@/lib/integrations/messaging"; // P3: messaging.send(), messaging.notifyHandoff()
export * as outbox from "@/lib/integrations/outbox"; // P3: outbox.send()
export * as secrets from "@/lib/integrations/secrets"; // P3: encrypt/decrypt/mask
export * as filters from "@/lib/filters"; // P2: filters.buildWhere(entity, filters, {userId, canSeeValues}), filters.parseFilterParam(searchParams.f)
