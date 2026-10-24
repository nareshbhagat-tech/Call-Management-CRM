import { json, route } from "@/lib/api";
import { dashboard } from "@/lib/crm";

export const GET = route(async () => json(dashboard()), "admin");
