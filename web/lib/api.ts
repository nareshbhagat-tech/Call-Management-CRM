import { currentUser } from "./auth";
import type { User } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

/** Wraps a route handler: resolves the signed-in user and turns HttpErrors into JSON responses. */
export function route<C>(handler: (req: Request, user: User, ctx: C) => Promise<Response>, role?: "admin") {
  return async (req: Request, ctx: C) => {
    try {
      const user = await currentUser();
      if (!user) throw new HttpError(401, "Not signed in");
      if (role && user.role !== role) throw new HttpError(403, "Admins only");
      return await handler(req, user, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Server error" }, 500);
    }
  };
}

export function required(body: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    if (typeof body[k] !== "string" || !(body[k] as string).trim()) throw new HttpError(400, `${k} is required`);
  }
}
