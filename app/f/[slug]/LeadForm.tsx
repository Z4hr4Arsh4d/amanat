"use client";
// P2 owns. Public lead form UI (F3.1).
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { submitLeadForm } from "./actions";

export function LeadForm({ slug, company }: { slug: string; company: string }) {
  const { pending, run } = useAction();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className={`${ui.card} py-10 text-center`} role="status">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Icon name="check" className="h-6 w-6" strokeWidth={2.4} /></span>
        <h2 className="mt-4 text-lg font-bold text-stone-900">Thank you!</h2>
        <p className={`${ui.muted} mt-1`}>{company} has your details and will contact you very soon.</p>
      </div>
    );
  }

  return (
    <form
      className={`${ui.card} space-y-5 sm:p-6`}
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
      <div className={ui.field}>
        <label htmlFor="name" className={ui.label}>Your name</label>
        <input id="name" name="name" required maxLength={100} autoComplete="name" placeholder="e.g. Ahmed Raza" className={ui.input} />
      </div>
      <div className={ui.field}>
        <label htmlFor="phone" className={ui.label}>Phone number</label>
        <input id="phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="0300 1234567" className={ui.input} />
      </div>
      <div className={ui.field}>
        <label htmlFor="email" className={ui.label}>Email <span className="font-normal text-stone-500">(optional)</span></label>
        <input id="email" name="email" type="email" maxLength={200} autoComplete="email" placeholder="you@example.com" className={ui.input} />
      </div>
      <div className={ui.field}>
        <label htmlFor="message" className={ui.label}>How can we help? <span className="font-normal text-stone-500">(optional)</span></label>
        <textarea id="message" name="message" rows={4} maxLength={2000} placeholder="e.g. I need a quote for a 5kW rooftop system." className={ui.input} />
      </div>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className={`${ui.btnPrimary} !h-11 w-full !text-[15px]`}>
        {pending ? <Spinner /> : <Icon name="send" className="h-4 w-4" />}{pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
