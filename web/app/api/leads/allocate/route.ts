import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/api";
import { nextAgent } from "@/lib/crm";

/** Spread every unassigned lead across active agents. */
export const POST = route(async () => {
  const ids = db.prepare("SELECT id FROM leads WHERE assigned_to IS NULL ORDER BY id").all() as { id: number }[];
  const assign = db.prepare("UPDATE leads SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?");
  db.transaction(() => {
    for (const { id } of ids) {
      const agent = nextAgent();
      if (!agent) throw new HttpError(400, "Add an active agent first");
      assign.run(agent, id);
    }
  })();
  return json({ assigned: ids.length });
}, "admin");
