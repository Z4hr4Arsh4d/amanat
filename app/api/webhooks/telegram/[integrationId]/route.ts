// P2 owns. Webhook for telegram. Steps: 1) verify signature  2) dedupe by provider event id
// 3) process  4) log IntegrationEvent. Webhooks are exempt from the Origin check in middleware.ts.
export async function POST() {
  return new Response("not implemented", { status: 501 });
}
