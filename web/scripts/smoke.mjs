// End-to-end check of the API. Starts `next start` on a throwaway database, runs every main flow, then stops.
// Usage: npm run build && npm test
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-test-"));
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, DATA_DIR: dataDir, ADMIN_EMAIL: "admin@test.in", ADMIN_PASSWORD: "secret1", LEAD_WEBHOOK_KEY: "hook-key", NODE_ENV: "production" },
  stdio: ["ignore", "inherit", "inherit"],
  detached: true, // own process group, so cleanup also stops the next-server child
});

async function api(pathname, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body && !(body instanceof FormData) && { "content-type": "application/json" }), ...headers },
    body: body instanceof FormData ? body : body && JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + "/login"); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("server did not start");
}

try {
  await waitForServer();

  // Auth
  assert.equal((await api("/api/leads")).status, 401);
  assert.equal((await api("/api/auth/login", { method: "POST", body: { email: "admin@test.in", password: "nope" } })).status, 401);
  const admin = (await api("/api/auth/login", { method: "POST", body: { email: "admin@test.in", password: "secret1" } })).data.token;
  assert.ok(admin);

  // Team
  for (const [name, email] of [["Asha", "asha@test.in"], ["Ravi", "ravi@test.in"]]) {
    assert.equal((await api("/api/users", { token: admin, method: "POST", body: { name, email, password: "pass123" } })).status, 201);
  }
  assert.equal((await api("/api/users", { token: admin, method: "POST", body: { name: "Dup", email: "ASHA@test.in", password: "pass123" } })).status, 409);
  const asha = (await api("/api/auth/login", { method: "POST", body: { email: "asha@test.in", password: "pass123" } })).data.token;
  const ravi = (await api("/api/auth/login", { method: "POST", body: { email: "ravi@test.in", password: "pass123" } })).data.token;
  assert.equal((await api("/api/users", { token: asha })).status, 403, "agents can't manage users");

  // Leads: manual, duplicate by normalized phone, webhook, CSV import with quotes and a bad row
  const l1 = await api("/api/leads", { token: admin, method: "POST", body: { name: "Mehta Events", phone: "+91 98765 43210" } });
  assert.equal(l1.status, 201);
  assert.equal((await api("/api/leads", { token: admin, method: "POST", body: { name: "Same", phone: "09876543210" } })).data.created, false);
  assert.equal((await api("/api/leads", { method: "POST", body: { name: "Web", phone: "9000000001" } })).status, 401);
  assert.equal((await api("/api/leads", { method: "POST", headers: { "x-api-key": "hook-key" }, body: { name: "Web Form", phone: "9000000001" } })).status, 201);
  const fd = new FormData();
  fd.append("file", new Blob(['name,phone,source\n"Sharma, Ranchi",9000000002,expo\nBad,123,expo\nKumar,9000000003,\n']), "leads.csv");
  const imp = await api("/api/leads/import", { token: admin, method: "POST", body: fd });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.created, 2);
  assert.equal(imp.data.errors.length, 1);

  // Auto-allocation spreads 4 leads 2/2
  const all = (await api("/api/leads", { token: admin })).data.leads;
  assert.equal(all.length, 4);
  assert.ok(all.some((l) => l.name === "Sharma, Ranchi"));
  const mine = (await api("/api/leads", { token: asha })).data.leads;
  const ravis = (await api("/api/leads", { token: ravi })).data.leads;
  assert.equal(mine.length, 2);
  assert.equal(ravis.length, 2);

  // Agents can't see or edit each other's leads
  const myLead = mine[0];
  assert.equal((await api(`/api/leads/${ravis[0].id}`, { token: asha })).status, 404);
  assert.equal((await api(`/api/leads/${myLead.id}`, { token: asha, method: "PATCH", body: { assigned_to: null } })).status, 403);

  // Call sync: lead call stored, personal call dropped, re-sync is idempotent
  const started = new Date(Date.now() - 60_000).toISOString();
  const calls = [
    { client_id: "c1", phone: "+91" + myLead.phone_key, direction: "outgoing", started_at: started, duration_sec: 95 },
    { client_id: "c2", phone: "9111111111", direction: "incoming", started_at: started, duration_sec: 30 },
  ];
  let sync = await api("/api/calls", { token: asha, method: "POST", body: { calls } });
  assert.equal(sync.status, 200, JSON.stringify(sync.data));
  assert.equal(sync.data.stored.length, 1, "personal call must be dropped");
  const callId = sync.data.stored[0].id;
  sync = await api("/api/calls", { token: asha, method: "POST", body: { calls: [{ ...calls[0], outcome: "Interested, send quote" }] } });
  assert.equal(sync.data.stored[0].id, callId);
  assert.equal((await api("/api/calls", { token: asha, method: "POST", body: { calls: [{ client_id: "x", phone: "1", direction: "sideways", started_at: started }] } })).status, 400);

  // Recording upload + download; other agent can't fetch it
  const rec = new FormData();
  rec.append("file", new Blob([Buffer.from("ID3fakeaudio")]), "call.mp3");
  assert.equal((await api(`/api/calls/${callId}/recording`, { token: ravi, method: "POST", body: rec })).status, 404);
  assert.equal((await api(`/api/calls/${callId}/recording`, { token: asha, method: "POST", body: rec })).status, 200);
  const audio = await fetch(`${BASE}/api/calls/${callId}/recording`, { headers: { authorization: `Bearer ${admin}` } });
  assert.equal(audio.status, 200);
  assert.equal(await audio.text(), "ID3fakeaudio");
  assert.equal((await api(`/api/calls/${callId}/recording`, { token: ravi })).status, 404);

  // Stage, follow-up and note land in the timeline; connected call moved "new" → "contacted"
  const due = new Date(Date.now() - 3600_000).toISOString();
  const upd = await api(`/api/leads/${myLead.id}`, { token: asha, method: "PATCH", body: { stage: "interested", next_follow_up: due, note: "Wants 40x60 hangar for Nov" } });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  const detail = (await api(`/api/leads/${myLead.id}`, { token: asha })).data;
  assert.equal(detail.lead.stage, "interested");
  assert.ok(detail.timeline.some((t) => t.kind === "call" && t.outcome === "Interested, send quote"));
  assert.ok(detail.timeline.some((t) => t.kind === "note" && t.text.includes("contacted → interested")));
  assert.equal((await api(`/api/leads/${myLead.id}`, { token: asha, method: "PATCH", body: { stage: "bogus" } })).status, 400);
  assert.equal((await api("/api/leads?due=1", { token: asha })).data.leads.length, 1);

  // Status heartbeat + dashboard
  assert.equal((await api("/api/status", { token: asha, method: "POST", body: { status: "available" } })).status, 200);
  const dash = (await api("/api/dashboard", { token: admin })).data;
  const a = dash.agents.find((x) => x.name === "Asha");
  assert.equal(a.calls, 1);
  assert.equal(a.talk_sec, 95);
  assert.equal(a.due_follow_ups, 1);
  assert.equal((await api("/api/dashboard", { token: asha })).status, 403);

  // Deactivating an agent signs them out and frees their open leads
  const raviId = (await api("/api/users", { token: admin })).data.users.find((u) => u.name === "Ravi").id;
  assert.equal((await api(`/api/users/${raviId}`, { token: admin, method: "PATCH", body: { active: false } })).status, 200);
  assert.equal((await api("/api/leads", { token: ravi })).status, 401);
  assert.equal((await api("/api/leads?agent=none", { token: admin })).data.leads.length, 2);
  assert.equal((await api("/api/leads/allocate", { token: admin, method: "POST" })).data.assigned, 2);
  assert.equal((await api("/api/leads", { token: asha })).data.leads.length, 4);

  // Pages render
  const cookieRes = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@test.in", password: "secret1" }) });
  const cookie = cookieRes.headers.get("set-cookie").split(";")[0];
  for (const p of ["/", "/leads", `/leads/${myLead.id}`, "/follow-ups", "/users"]) {
    const res = await fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
    assert.equal(res.status, 200, `page ${p}`);
  }
  assert.equal((await fetch(BASE + "/leads", { redirect: "manual" })).status, 307, "signed-out users are redirected");

  console.log("\n✔ All API and page checks passed");
} catch (e) {
  console.error("\n✘", e);
  process.exitCode = 1;
} finally {
  process.kill(-server.pid);
  fs.rmSync(dataDir, { recursive: true, force: true });
}
