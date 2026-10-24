import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, type User } from "./db";

export const COOKIE = "crm_session";

export function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token,user_id) VALUES (?,?)").run(token, userId);
  return token;
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function userForToken(token: string | undefined): User | null {
  if (!token) return null;
  const user = db
    .prepare(
      `SELECT u.id,u.name,u.email,u.phone,u.role,u.status,u.last_seen,u.active
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1`,
    )
    .get(token) as User | undefined;
  return user ?? null;
}

/** Token from the web cookie or the Android app's "Authorization: Bearer" header. */
export async function currentToken() {
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return (await cookies()).get(COOKIE)?.value;
}

export async function currentUser() {
  return userForToken(await currentToken());
}

/** For pages: send signed-out visitors to the login screen. */
export async function requireUser(role?: "admin") {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/leads");
  return user;
}
