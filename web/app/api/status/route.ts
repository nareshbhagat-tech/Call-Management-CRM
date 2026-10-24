import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/api";

const STATUSES = ["available", "on_call", "break", "offline"];

/** The phone app reports agent status here; it doubles as a heartbeat. */
export const POST = route(async (req, user) => {
  const { status } = await req.json().catch(() => ({}));
  if (!STATUSES.includes(status)) throw new HttpError(400, "Unknown status");
  db.prepare("UPDATE users SET status = ?, last_seen = ? WHERE id = ?").run(status, new Date().toISOString(), user.id);
  return json({ ok: true });
});
