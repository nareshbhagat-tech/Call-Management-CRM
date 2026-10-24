import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { HttpError, json, required, route } from "@/lib/api";

export const GET = route(async () => {
  return json({ users: db.prepare("SELECT id,name,email,phone,role,status,last_seen,active FROM users ORDER BY active DESC, name").all() });
}, "admin");

export const POST = route(async (req) => {
  const body = await req.json().catch(() => ({}));
  required(body, "name", "email", "password");
  if (body.password.length < 6) throw new HttpError(400, "Password must be at least 6 characters");
  const role = body.role === "admin" ? "admin" : "agent";
  try {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)")
      .run(body.name.trim(), body.email.trim(), body.phone?.trim() || null, hashPassword(body.password), role);
    return json({ id: Number(lastInsertRowid) }, 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "A user with this email already exists");
    throw e;
  }
}, "admin");
