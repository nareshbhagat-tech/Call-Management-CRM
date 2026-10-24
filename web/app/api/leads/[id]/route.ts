import { json, route } from "@/lib/api";
import { leadForUser, timeline, updateLead } from "@/lib/crm";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, user, { params }) => {
  const lead = leadForUser(Number((await params).id), user);
  return json({ lead, timeline: timeline(lead.id) });
});

/** Change stage, follow-up date, assignee (admin), or add a note. */
export const PATCH = route<Ctx>(async (req, user, { params }) => {
  const lead = leadForUser(Number((await params).id), user);
  return json({ lead: updateLead(lead, user, await req.json().catch(() => ({}))) });
});
