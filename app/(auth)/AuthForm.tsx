"use client";
import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "./actions";

type Field = { name: string; label: string; type?: string; autoComplete?: string };

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
    <main className="min-h-dvh grid place-items-center px-4 bg-stone-50">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold tracking-wide text-emerald-800">AMANAT</p>
          <h1 className="text-2xl font-semibold text-stone-900">{props.title}</h1>
          <p className="text-sm text-stone-600">{props.subtitle}</p>
        </div>
        {props.fields.map((f) => (
          <div key={f.name} className="space-y-1">
            <label htmlFor={f.name} className="block text-sm font-medium text-stone-800">{f.label}</label>
            <input
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              defaultValue={state.fields?.[f.name] ?? ""}
              required
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        ))}
        {state.error && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠ {state.error}</p>
        )}
        <button
          disabled={pending}
          className="w-full rounded-md bg-emerald-800 px-4 py-2 font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Please wait…" : props.submit}
        </button>
        <p className="text-center text-sm text-stone-600">
          {props.footer.text}{" "}
          <Link href={props.footer.href} className="font-medium text-emerald-800 underline">{props.footer.link}</Link>
        </p>
      </form>
    </main>
  );
}
