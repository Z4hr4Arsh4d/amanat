#!/usr/bin/env node
// Amanat security check (PLAN §2.3, Q2). Run against a seeded app:
//   node scripts/security-check.mjs                     (defaults to http://localhost:3000)
//   node scripts/security-check.mjs https://your-app.up.railway.app
//   node scripts/security-check.mjs --bruteforce        (also shows the 429 lockout, using a throwaway email)
// Shows: no cookie → 401, missing permission → 403, another workspace's id → 404, values masked,
// cross-site POST blocked, and (optional) brute-force lockout.
const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BRUTE = args.includes("--bruteforce");
const PASSWORD = process.env.SEED_PASSWORD ?? "password123";

const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`, bold = (s) => `\x1b[1m${s}\x1b[0m`;
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`${green("PASS")} ${name}`); }
  else { fail++; console.log(`${red("FAIL")} ${name}${detail ? dim(`  (${detail})`) : ""}`); }
}

async function req(method, path, { cookie, body, origin } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  if (origin) headers.Origin = origin;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null;
  const text = await r.text();
  try { json = JSON.parse(text); } catch { /* not JSON (e.g. CSV) */ }
  return { status: r.status, json, text, res: r };
}

async function login(workspace, email) {
  const r = await req("POST", "/api/auth/login", { body: { workspace, email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`Login failed for ${email} @ ${workspace}: ${r.status} ${r.json?.error ?? r.text.slice(0, 120)}. Did you run "npm run seed"?`);
  const set = r.res.headers.getSetCookie?.() ?? [r.res.headers.get("set-cookie") ?? ""];
  const c = set.map((x) => x.split(";")[0]).find((x) => x.startsWith("amanat_session="));
  if (!c) throw new Error("No session cookie returned");
  return c;
}

console.log(bold(`\nAmanat security check → ${BASE}\n`));
const ownerA = await login("sunrise-solar", "owner@sunrise.test");
const salesA = await login("sunrise-solar", "hina@sunrise.test"); // Sales role: no crm.delete, no opportunity.value.view, no crm.export
const ownerB = await login("capital-realty", "owner@capital.test");
console.log(dim("Logged in: Ayesha (Owner, workspace A), Hina (Sales, workspace A), Owner of workspace B\n"));

const list = await req("GET", "/api/contacts", { cookie: ownerA });
const contact = list.json?.items?.[0];
const opps = await req("GET", "/api/opportunities", { cookie: ownerA });
const opp = opps.json?.items?.find((o) => o.value > 0) ?? opps.json?.items?.[0];
if (!contact || !opp) { console.log(red("Workspace A has no contacts/opportunities. Run npm run seed first.")); process.exit(1); }
console.log(dim(`Target contact in workspace A: ${contact.name} (${contact.id})`));
console.log(dim(`Target opportunity in workspace A: ${opp.title} (${opp.id})\n`));

console.log(bold("1. Not logged in → 401"));
let r = await req("GET", "/api/contacts");
check("GET /api/contacts with no cookie → 401", r.status === 401, r.status);
r = await req("DELETE", `/api/contacts/${contact.id}`);
check(`DELETE /api/contacts/${contact.id} with no cookie → 401`, r.status === 401, r.status);
r = await req("GET", "/api/export/contacts");
check("GET /api/export/contacts with no cookie → 401", r.status === 401, r.status);

console.log(bold("\n2. Missing permission → 403 (checked on the server, not just hidden in the UI)"));
r = await req("DELETE", `/api/contacts/${contact.id}`, { cookie: salesA });
check(`Hina (no crm.delete) DELETE contact → 403 "${r.json?.error ?? ""}"`, r.status === 403, r.status);
r = await req("GET", "/api/export/contacts", { cookie: salesA });
check("Hina (no crm.export) export CSV → 403", r.status === 403, r.status);
r = await req("GET", `/api/contacts/${contact.id}`, { cookie: ownerA });
check("…and the contact still exists (Owner can read it) → 200", r.status === 200, r.status);

console.log(bold("\n3. Another workspace's id → 404 (attackers can't even tell it exists)"));
r = await req("GET", `/api/contacts/${contact.id}`, { cookie: ownerB });
check("Workspace B owner GET workspace A's contact → 404", r.status === 404, r.status);
r = await req("DELETE", `/api/contacts/${contact.id}`, { cookie: ownerB });
check("Workspace B owner DELETE workspace A's contact → 404", r.status === 404, r.status);
r = await req("GET", `/api/opportunities/${opp.id}`, { cookie: ownerB });
check("Workspace B owner GET workspace A's opportunity → 404", r.status === 404, r.status);
r = await req("GET", "/api/contacts", { cookie: ownerB });
check("Workspace B's contact list contains none of A's contacts", r.status === 200 && !r.json.items.some((c) => c.id === contact.id), r.status);
r = await req("GET", `/api/contacts/${contact.id}`, { cookie: ownerA });
check("…while workspace A still sees it → 200", r.status === 200, r.status);

console.log(bold("\n4. Field masking (F1.4)"));
r = await req("GET", `/api/opportunities/${opp.id}`, { cookie: ownerA });
check(`Owner sees the value → ${r.json?.currency} ${r.json?.value}`, r.status === 200 && typeof r.json?.value === "number" && r.json.valueMasked === false, JSON.stringify(r.json)?.slice(0, 80));
r = await req("GET", `/api/opportunities/${opp.id}`, { cookie: salesA });
check("Hina (no opportunity.value.view) gets value: null, valueMasked: true", r.status === 200 && r.json?.value === null && r.json?.valueMasked === true, JSON.stringify(r.json)?.slice(0, 80));
r = await req("GET", "/api/opportunities", { cookie: salesA });
check("…masked in the list too", r.status === 200 && r.json.items.every((o) => o.value === null && o.valueMasked), r.status);

console.log(bold("\n5. Cross-site request (CSRF) blocked"));
r = await req("POST", "/api/auth/login", { origin: "https://evil.example", body: { workspace: "sunrise-solar", email: "owner@sunrise.test", password: PASSWORD } });
check(`POST from Origin https://evil.example → 403 "${r.json?.error ?? ""}"`, r.status === 403, r.status);

if (BRUTE) {
  console.log(bold("\n6. Brute-force lockout (throwaway email, real users are not affected)"));
  const email = `attacker${Date.now()}@example.test`;
  let last;
  for (let i = 1; i <= 6; i++) last = await req("POST", "/api/auth/login", { body: { workspace: "sunrise-solar", email, password: "wrong-" + i } });
  check(`6th wrong password in a row → 429 "${last.json?.error ?? ""}"`, last.status === 429, last.status);
} else {
  console.log(dim("\n(Add --bruteforce to also show the 429 lockout.)"));
}

console.log(`\n${fail === 0 ? green(bold(`All ${pass} checks passed.`)) : red(bold(`${fail} failed, ${pass} passed.`))}\n`);
process.exit(fail === 0 ? 0 : 1);
