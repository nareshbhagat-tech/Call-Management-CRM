import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { HttpError, json, route } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Deactivate/reactivate a user or reset their password. */
export const PATCH = route<Ctx>(async (req, me, { params }) => {
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new HttpError(404, "User not found");
  db.transaction(() => {
    if (typeof body.active === "boolean") {
      if (id === me.id && !body.active) throw new HttpError(400, "You can't deactivate yourself");
      db.prepare("UPDATE users SET active = ? WHERE id = ?").run(body.active ? 1 : 0, id);
      // Signing out a deactivated user; their leads go back to the pool for reallocation.
      if (!body.active) {
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
        db.prepare("UPDATE leads SET assigned_to = NULL WHERE assigned_to = ? AND stage NOT IN ('won','lost')").run(id);
      }
    }
    if (typeof body.password === "string") {
      if (body.password.length < 6) throw new HttpError(400, "Password must be at least 6 characters");
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), id);
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND user_id != ?").run(id, me.id);
    }
  })();
  return json({ ok: true });
}, "admin");
