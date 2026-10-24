import { cookies } from "next/headers";
import { COOKIE, currentToken, deleteSession } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST() {
  const token = await currentToken();
  if (token) deleteSession(token);
  (await cookies()).delete(COOKIE);
  return json({ ok: true });
}
