// P3 owns. Sample WhatsApp conversations and sync history so the Inbox and Integrations pages
// have something to show on a fresh install. Real credentials are entered on /integrations.
// TODO §4.3/§4.4: payments (paid, pending, refunded) and appointments.
import type { PrismaClient } from "@prisma/client";

const ago = (min: number) => new Date(Date.now() - min * 60_000);

export async function seedIntegrations(prisma: PrismaClient, workspaceId: string) {
  const users = await prisma.user.findMany({ where: { workspaceId } });
  const hina = users.find((u) => u.email.startsWith("hina@"));
  const sara = users.find((u) => u.email.startsWith("sara@"));

  const samples = [
    {
      name: "Ahmed Raza", phone: "+923005550001", ownerId: hina?.id ?? null, optedOut: false,
      msgs: [
        { dir: "IN", body: "Hi, I need a quote for a 5kW solar system.", min: 50 },
        { dir: "OUT", body: "Thank you for contacting us. Hina will reply within 1 minute.", min: 50, status: "READ" },
        { dir: "OUT", body: "Hello Ahmed, what is your monthly electricity bill?", min: 45, status: "DELIVERED", by: hina?.id },
        { dir: "IN", body: "Around PKR 30,000 in summer.", min: 40 },
      ],
    },
    {
      name: "Fatima Noor", phone: "+923005550002", ownerId: sara?.id ?? null, optedOut: false,
      msgs: [
        { dir: "IN", body: "Do you install in Lahore?", min: 30 * 60 },
        { dir: "OUT", body: "Yes, we do. Can we book a site visit?", min: 29 * 60, status: "FAILED", by: sara?.id, code: "63016",
          reason: "This customer has not messaged in the last 24 hours, so WhatsApp only allows template messages. Ask them to message you first." },
      ],
    },
    {
      name: "Usman Tariq", phone: "+923005550003", ownerId: null, optedOut: true,
      msgs: [
        { dir: "IN", body: "Price?", min: 300 },
        { dir: "IN", body: "STOP", min: 290 },
      ],
    },
  ] as const;

  for (const s of samples) {
    const contact = await prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone: s.phone } },
      create: { workspaceId, name: s.name, phone: s.phone, ownerId: s.ownerId, optedOut: s.optedOut, optedOutAt: s.optedOut ? ago(290) : null },
      update: {},
    });
    const last = Math.min(...s.msgs.map((m) => m.min));
    const convo = await prisma.conversation.upsert({
      where: { contactId_channel: { contactId: contact.id, channel: "WHATSAPP" } },
      create: { workspaceId, contactId: contact.id, lastMessageAt: ago(last) },
      update: {},
    });
    for (const [i, m] of s.msgs.entries()) {
      const sid = `SMseed${workspaceId.slice(-6)}${s.phone.slice(-4)}${i}`;
      await prisma.message.upsert({
        where: { providerSid: sid },
        create: {
          workspaceId, conversationId: convo.id, direction: m.dir, body: m.body, providerSid: sid, createdAt: ago(m.min),
          status: m.dir === "IN" ? "RECEIVED" : ("status" in m ? m.status : "SENT"),
          sentById: "by" in m ? m.by ?? null : null,
          errorCode: "code" in m ? m.code : null, errorReason: "reason" in m ? m.reason : null,
        },
        update: {},
      });
      await prisma.integrationEvent.upsert({
        where: { provider_externalId: { provider: "TWILIO", externalId: sid } },
        create: {
          workspaceId, provider: "TWILIO", direction: m.dir, type: m.dir === "IN" ? "message.inbound" : "twilio.message", externalId: sid,
          status: m.dir === "IN" ? "PROCESSED" : "status" in m && m.status === "FAILED" ? "FAILED" : "SENT", attempts: 1, createdAt: ago(m.min),
          error: "reason" in m ? m.reason : null, payload: { From: s.phone, preview: m.body.slice(0, 80), seeded: true },
        },
        update: {},
      });
    }
  }
  // A forged webhook, to show what a rejected request looks like in the history.
  await prisma.integrationEvent.create({
    data: { workspaceId, provider: "TWILIO", direction: "IN", type: "message.inbound", status: "REJECTED", createdAt: ago(20),
      error: "Invalid signature. The request was ignored.", payload: { claimedMessageSid: "SMforged", seeded: true } },
  });
}
