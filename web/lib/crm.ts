import { db, STAGES, type Call, type Lead, type Stage, type User } from "./db";
import { HttpError } from "./api";
import { phoneKey } from "./phone";

// shortcut: "today" uses IST (UTC+5:30) for every user; make it a setting if teams in other time zones join.
const TZ_OFFSET_MS = 330 * 60_000;

export function startOfToday(now = Date.now()) {
  const local = new Date(now + TZ_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - TZ_OFFSET_MS).toISOString();
}

export function endOfToday(now = Date.now()) {
  return new Date(Date.parse(startOfToday(now)) + 86_400_000).toISOString();
}

const isStage = (s: unknown): s is Stage => STAGES.includes(s as Stage);

function addNote(leadId: number, userId: number, text: string) {
  db.prepare("INSERT INTO notes (lead_id,user_id,text) VALUES (?,?,?)").run(leadId, userId, text);
}

/** Active agent with the fewest open leads — keeps the load even as leads arrive. */
export function nextAgent(): number | null {
  const row = db
    .prepare(
      `SELECT u.id FROM users u
       LEFT JOIN leads l ON l.assigned_to = u.id AND l.stage NOT IN ('won','lost')
       WHERE u.role = 'agent' AND u.active = 1
       GROUP BY u.id ORDER BY COUNT(l.id), u.id LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function createLead(input: { name: string; phone: string; source?: string | null; assigned_to?: number | null }) {
  const key = phoneKey(input.phone);
  if (key.length < 10) throw new HttpError(400, `Invalid phone number: ${input.phone}`);
  const existing = db.prepare("SELECT * FROM leads WHERE phone_key = ?").get(key) as Lead | undefined;
  if (existing) return { lead: existing, created: false };
  const assigned = input.assigned_to ?? nextAgent();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO leads (name,phone,phone_key,source,assigned_to) VALUES (?,?,?,?,?)")
    .run(input.name.trim(), input.phone.trim(), key, input.source ?? null, assigned);
  return { lead: getLead(Number(lastInsertRowid))!, created: true };
}

export function getLead(id: number) {
  return db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead | undefined;
}

/** Agents only see their own leads; admins see everything. */
export function leadForUser(id: number, user: User) {
  const lead = getLead(id);
  if (!lead || (user.role !== "admin" && lead.assigned_to !== user.id)) throw new HttpError(404, "Lead not found");
  return lead;
}

export type LeadRow = Lead & { agent_name: string | null; last_call_at: string | null };

export function listLeads(user: User, f: { q?: string; stage?: string; agent?: string; due?: boolean } = {}) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (user.role !== "admin") {
    where.push("l.assigned_to = ?");
    args.push(user.id);
  } else if (f.agent === "none") {
    where.push("l.assigned_to IS NULL");
  } else if (f.agent) {
    where.push("l.assigned_to = ?");
    args.push(Number(f.agent));
  }
  if (f.stage && isStage(f.stage)) {
    where.push("l.stage = ?");
    args.push(f.stage);
  }
  if (f.q) {
    where.push("(l.name LIKE ? OR l.phone_key LIKE ?)");
    args.push(`%${f.q}%`, `%${phoneKey(f.q) || f.q}%`);
  }
  if (f.due) {
    where.push("l.next_follow_up IS NOT NULL AND l.next_follow_up < ? AND l.stage NOT IN ('won','lost')");
    args.push(endOfToday());
  }
  return db
    .prepare(
      `SELECT l.*, u.name agent_name, (SELECT MAX(started_at) FROM calls c WHERE c.lead_id = l.id) last_call_at
       FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY ${f.due ? "l.next_follow_up ASC" : "l.updated_at DESC"} LIMIT 500`,
    )
    .all(...args) as LeadRow[];
}

export function updateLead(
  lead: Lead,
  user: User,
  body: { stage?: unknown; next_follow_up?: unknown; assigned_to?: unknown; note?: unknown; name?: unknown },
) {
  const set: string[] = [];
  const args: unknown[] = [];
  const log: string[] = [];
  if (body.stage !== undefined && body.stage !== lead.stage) {
    if (!isStage(body.stage)) throw new HttpError(400, "Unknown stage");
    set.push("stage = ?");
    args.push(body.stage);
    log.push(`Stage: ${lead.stage} → ${body.stage}`);
  }
  if (body.next_follow_up !== undefined) {
    const v = body.next_follow_up ? new Date(String(body.next_follow_up)) : null;
    if (v && isNaN(v.getTime())) throw new HttpError(400, "Invalid follow-up date");
    set.push("next_follow_up = ?");
    args.push(v?.toISOString() ?? null);
    log.push(v ? `Follow-up set for ${v.toISOString()}` : "Follow-up cleared");
  }
  if (body.assigned_to !== undefined) {
    if (user.role !== "admin") throw new HttpError(403, "Only admins can reassign leads");
    const to = body.assigned_to === null || body.assigned_to === "" ? null : Number(body.assigned_to);
    const agent = to === null ? null : (db.prepare("SELECT name FROM users WHERE id = ? AND active = 1").get(to) as { name: string } | undefined);
    if (to !== null && !agent) throw new HttpError(400, "Unknown agent");
    set.push("assigned_to = ?");
    args.push(to);
    log.push(`Assigned to ${agent?.name ?? "nobody"}`);
  }
  if (typeof body.name === "string" && body.name.trim()) {
    set.push("name = ?");
    args.push(body.name.trim());
  }
  db.transaction(() => {
    if (set.length) db.prepare(`UPDATE leads SET ${set.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...args, lead.id);
    for (const line of log) addNote(lead.id, user.id, line);
    if (typeof body.note === "string" && body.note.trim()) {
      addNote(lead.id, user.id, body.note.trim());
      if (!set.length) db.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").run(lead.id);
    }
  })();
  return getLead(lead.id)!;
}

export type TimelineItem =
  | ({ kind: "call"; agent_name: string; at: string } & Call)
  | { kind: "note"; id: number; text: string; agent_name: string; at: string };

export function timeline(leadId: number): TimelineItem[] {
  const calls = db
    .prepare("SELECT c.*, u.name agent_name, c.started_at at FROM calls c JOIN users u ON u.id = c.user_id WHERE lead_id = ?")
    .all(leadId) as (Call & { agent_name: string; at: string })[];
  const notes = db
    .prepare(
      `SELECT n.id, n.text, u.name agent_name, strftime('%Y-%m-%dT%H:%M:%fZ', n.created_at) at
       FROM notes n JOIN users u ON u.id = n.user_id WHERE lead_id = ?`,
    )
    .all(leadId) as { id: number; text: string; agent_name: string; at: string }[];
  return [
    ...calls.map((c) => ({ kind: "call" as const, ...c })),
    ...notes.map((n) => ({ kind: "note" as const, ...n })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

const DIRECTIONS = ["incoming", "outgoing", "missed", "rejected"];

export interface CallInput {
  client_id: string;
  phone: string;
  direction: string;
  started_at: string;
  duration_sec?: number;
  outcome?: string | null;
}

/**
 * Stores calls synced from a phone. Only calls with a known lead are kept,
 * so agents' personal calls never reach the server.
 */
export function saveCalls(user: User, calls: CallInput[]) {
  const findLead = db.prepare(
    "SELECT id FROM leads WHERE phone_key = ? ORDER BY (assigned_to = ?) DESC, id LIMIT 1",
  );
  const upsert = db.prepare(
    `INSERT INTO calls (client_id,user_id,lead_id,phone,direction,started_at,duration_sec,outcome)
     VALUES (@client_id,@user_id,@lead_id,@phone,@direction,@started_at,@duration_sec,@outcome)
     ON CONFLICT(client_id) DO UPDATE SET outcome = COALESCE(excluded.outcome, calls.outcome)
     RETURNING id, client_id, recording_file IS NOT NULL has_recording`,
  );
  const touch = db.prepare("UPDATE leads SET updated_at = datetime('now'), stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END WHERE id = ?");
  const stored: { client_id: string; id: number; has_recording: boolean }[] = [];
  db.transaction(() => {
    for (const c of calls) {
      if (!c.client_id || !c.phone || !DIRECTIONS.includes(c.direction) || isNaN(Date.parse(c.started_at))) {
        throw new HttpError(400, `Invalid call record: ${JSON.stringify(c)}`);
      }
      const lead = findLead.get(phoneKey(c.phone), user.id) as { id: number } | undefined;
      if (!lead) continue;
      const row = upsert.get({
        client_id: `${user.id}:${c.client_id}`,
        user_id: user.id,
        lead_id: lead.id,
        phone: c.phone,
        direction: c.direction,
        started_at: new Date(c.started_at).toISOString(),
        duration_sec: Math.max(0, Math.round(c.duration_sec ?? 0)),
        outcome: c.outcome ?? null,
      }) as { id: number; client_id: string; has_recording: number };
      // Connected calls move a fresh lead out of "new".
      if (c.direction === "outgoing" && (c.duration_sec ?? 0) > 0) touch.run(lead.id);
      stored.push({ client_id: c.client_id, id: row.id, has_recording: !!row.has_recording });
    }
  })();
  return stored;
}

export function callForUser(id: number, user: User) {
  const call = db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as Call | undefined;
  if (!call) throw new HttpError(404, "Call not found");
  if (user.role !== "admin" && call.user_id !== user.id) {
    const lead = call.lead_id ? getLead(call.lead_id) : undefined;
    if (lead?.assigned_to !== user.id) throw new HttpError(404, "Call not found");
  }
  return call;
}

export interface AgentStats {
  id: number;
  name: string;
  status: string;
  last_seen: string | null;
  calls: number;
  connected: number;
  talk_sec: number;
  open_leads: number;
  due_follow_ups: number;
}

export function dashboard() {
  const since = startOfToday();
  const until = endOfToday();
  const agents = db
    .prepare(
      `SELECT u.id, u.name, u.status, u.last_seen,
        (SELECT COUNT(*) FROM calls c WHERE c.user_id = u.id AND c.started_at >= @since) calls,
        (SELECT COUNT(*) FROM calls c WHERE c.user_id = u.id AND c.started_at >= @since AND c.duration_sec > 0) connected,
        (SELECT COALESCE(SUM(duration_sec),0) FROM calls c WHERE c.user_id = u.id AND c.started_at >= @since) talk_sec,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.stage NOT IN ('won','lost')) open_leads,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.stage NOT IN ('won','lost')
           AND l.next_follow_up IS NOT NULL AND l.next_follow_up < @until) due_follow_ups
       FROM users u WHERE u.role = 'agent' AND u.active = 1 ORDER BY u.name`,
    )
    .all({ since, until }) as AgentStats[];
  const stages = db.prepare("SELECT stage, COUNT(*) n FROM leads GROUP BY stage").all() as { stage: Stage; n: number }[];
  const unassigned = (db.prepare("SELECT COUNT(*) n FROM leads WHERE assigned_to IS NULL").get() as { n: number }).n;
  return { agents, stages, unassigned };
}

/** Agents not seen for 20 minutes (the phone syncs every 15 in the background) are shown as offline whatever they last reported. */
export function effectiveStatus(status: string, lastSeen: string | null) {
  if (!lastSeen || Date.now() - Date.parse(lastSeen) > 20 * 60_000) return "offline";
  return status;
}

export function activeAgents() {
  return db.prepare("SELECT id, name FROM users WHERE role = 'agent' AND active = 1 ORDER BY name").all() as { id: number; name: string }[];
}
