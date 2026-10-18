"use client";
// P2 owns. Public lead form UI (F3.1).
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { submitLeadForm } from "./actions";

export function LeadForm({ slug, company }: { slug: string; company: string }) {
  const { pending, run } = useAction();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className={ui.card} role="status">
        <h2 className="text-lg font-semibold text-stone-900">✓ Thank you!</h2>
        <p className={`${ui.muted} mt-1`}>{company} has your details and will contact you very soon.</p>
      </div>
    );
  }

  return (
    <form
      className={`${ui.card} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "");
        run(
          () => submitLeadForm({ slug, name: v("name"), phone: v("phone"), email: v("email"), message: v("message"), website: v("website") }),
          { onSuccess: () => setSent(true) },
        );
      }}
    >
      <div>
        <label htmlFor="name" className={ui.label}>Your name</label>
        <input id="name" name="name" required maxLength={100} autoComplete="name" className={ui.input} />
      </div>
      <div>
        <label htmlFor="phone" className={ui.label}>Phone number</label>
        <input id="phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="0300 1234567" className={ui.input} />
      </div>
      <div>
        <label htmlFor="email" className={ui.label}>Email (optional)</label>
        <input id="email" name="email" type="email" maxLength={200} autoComplete="email" className={ui.input} />
      </div>
      <div>
        <label htmlFor="message" className={ui.label}>How can we help? (optional)</label>
        <textarea id="message" name="message" rows={4} maxLength={2000} className={ui.input} />
      </div>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className={`${ui.btnPrimary} w-full`}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
