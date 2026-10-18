// P3 owns. Stripe client (test mode only). Payment flows live in payments.ts (§4.3).
import Stripe from "stripe";

export function stripeClient(secretKey: string) {
  return new Stripe(secretKey, { timeout: 10_000, maxNetworkRetries: 0 });
}

/** One cheap call to prove the key works. Throws the Stripe error otherwise. */
export async function verifyStripeKey(secretKey: string) {
  const b = await stripeClient(secretKey).balance.retrieve();
  return { livemode: b.livemode };
}
