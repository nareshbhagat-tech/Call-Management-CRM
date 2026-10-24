import { json, route } from "@/lib/api";

export const GET = route(async (_req, user) => json({ user }));
