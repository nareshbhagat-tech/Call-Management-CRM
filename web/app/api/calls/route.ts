import { HttpError, json, route } from "@/lib/api";
import { saveCalls } from "@/lib/crm";

/** Batch upload from the phone's call log. Calls to numbers that aren't leads are skipped. */
export const POST = route(async (req, user) => {
  const { calls } = await req.json().catch(() => ({}));
  if (!Array.isArray(calls) || calls.length > 1000) throw new HttpError(400, "Send { calls: [...] } with at most 1000 calls");
  return json({ stored: saveCalls(user, calls) });
});
