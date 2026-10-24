import crypto from "node:crypto";
import { currentUser } from "@/lib/auth";
import { HttpError, json, required, route } from "@/lib/api";
import { createLead, listLeads } from "@/lib/crm";

export const GET = route(async (req, user) => {
  const p = new URL(req.url).searchParams;
  return json({
    leads: listLeads(user, {
      q: p.get("q") ?? undefined,
      stage: p.get("stage") ?? undefined,
      agent: p.get("agent") ?? undefined,
      due: p.get("due") === "1",
    }),
  });
});

function webhookKeyOk(req: Request) {
  const expected = process.env.LEAD_WEBHOOK_KEY;
  const given = req.headers.get("x-api-key");
  if (!expected || !given || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Add one lead: admins from the dashboard, or website/ad forms via the x-api-key webhook. */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (user?.role !== "admin" && !webhookKeyOk(req)) throw new HttpError(401, "Admin sign-in or x-api-key required");
    const body = await req.json().catch(() => ({}));
    required(body, "name", "phone");
    const { lead, created } = createLead({
      name: body.name,
      phone: body.phone,
      source: typeof body.source === "string" ? body.source : user ? "manual" : "webhook",
      assigned_to: user && body.assigned_to ? Number(body.assigned_to) : null,
    });
    return json({ lead, created }, created ? 201 : 200);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
}
