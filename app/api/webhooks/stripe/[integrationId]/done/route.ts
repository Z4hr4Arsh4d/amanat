// P3 owns. Page the customer sees after Stripe Checkout. It changes nothing: only the signed webhook marks payments paid.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sim = q.get("sim") === "1";
  const paid = q.get("status") === "paid";
  const title = sim ? "Test payment link" : paid ? "Thank you!" : "Payment not completed";
  const text = sim
    ? "This is a simulated payment link (no Stripe account connected). Use the simulator to pay it."
    : paid ? "Your payment was received by Stripe. You can close this page." : "You left the payment page. You can open the link again to pay.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#fafaf9;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:28rem;background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:24px;text-align:center}h1{font-size:1.4rem;margin:0 0 8px}</style>
</head><body><main><h1>${paid ? "✓ " : ""}${title}</h1><p>${text}</p></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
