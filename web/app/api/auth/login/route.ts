import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { COOKIE, createSession } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") return json({ error: "Email and password are required" }, 400);
  const row = db
    .prepare("SELECT id,name,email,role,password_hash FROM users WHERE email = ? AND active = 1")
    .get(email.trim()) as { id: number; name: string; email: string; role: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return json({ error: "Wrong email or password" }, 401);
  const token = createSession(row.id);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return json({ token, user: { id: row.id, name: row.name, email: row.email, role: row.role } });
}
