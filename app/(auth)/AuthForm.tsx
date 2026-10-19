"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import type { FormState } from "./actions";

type Field = { name: string; label: string; type?: string; autoComplete?: string; placeholder?: string; hint?: string };

const POINTS = [
  { icon: "zap", title: "Every lead gets an owner in seconds", text: "Web form, website chat and WhatsApp enquiries are handed to the next free person." },
  { icon: "timer", title: "Nothing waits too long", text: "If nobody acknowledges in time, the lead moves on and a manager is told." },
  { icon: "card", title: "Deals, payments and visits in one place", text: "Pipeline, Stripe payment links and Google Calendar bookings side by side." },
] as const;

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-emerald-900 p-12 text-emerald-50 lg:flex lg:flex-col">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="text-lg font-extrabold tracking-tight text-white">Amanat</span>
        </div>
        <div className="relative my-auto max-w-md space-y-10 py-12">
          <h2 className="text-[2rem] font-bold leading-tight tracking-tight text-white">Every lead is an amanat.<span className="mt-2 block text-lg font-medium text-emerald-200">Something entrusted to you, handled with care.</span></h2>
          <ul className="space-y-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-200 ring-1 ring-white/15"><Icon name={p.icon} className="h-5 w-5" /></span>
                <span>
                  <span className="block font-semibold text-white">{p.title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-emerald-100/80">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}

function Input({ f, defaultValue }: { f: Field; defaultValue: string }) {
  const [show, setShow] = useState(false);
  const isPassword = f.type === "password";
  return (
    <div className={ui.field}>
      <label htmlFor={f.name} className={ui.label}>{f.label}</label>
      <div className="relative">
        <input
          id={f.name}
          name={f.name}
          type={isPassword && show ? "text" : (f.type ?? "text")}
          autoComplete={f.autoComplete}
          defaultValue={defaultValue}
          placeholder={f.placeholder}
          aria-describedby={f.hint ? `${f.name}-hint` : undefined}
          required
          className={`${ui.input} !py-2.5 ${isPassword ? "!pr-11" : ""}`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {show
                ? <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                : <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />}
            </svg>
          </button>
        )}
      </div>
      {f.hint && <p id={`${f.name}-hint`} className={ui.hint}>{f.hint}</p>}
    </div>
  );
}

export function AuthForm(props: {
  title: string;
  subtitle: string;
  submit: string;
  fields: Field[];
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  footer: { text: string; href: string; link: string };
}) {
  const [state, formAction, pending] = useActionState(props.action, {});
  return (
    <AuthShell>
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <LogoMark className="h-9 w-9" />
        <span className="text-lg font-extrabold tracking-tight text-stone-900">Amanat</span>
      </div>
      <form action={formAction} className="space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">{props.title}</h1>
          <p className="text-sm leading-6 text-stone-600">{props.subtitle}</p>
        </div>
        {props.fields.map((f) => <Input key={f.name} f={f} defaultValue={state.fields?.[f.name] ?? ""} />)}
        {state.error && (
          <p role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            <Icon name="alertCircle" className="mt-0.5 h-4 w-4 text-red-700" />{state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${ui.btnPrimary} !h-11 w-full !text-[15px]`}>
          {pending && <Spinner />}{pending ? "Please wait…" : props.submit}
        </button>
        <p className="text-center text-sm text-stone-600">
          {props.footer.text}{" "}
          <Link href={props.footer.href} className={ui.link}>{props.footer.link}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
