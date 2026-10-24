import { requireUser } from "@/lib/auth";
import { listLeads } from "@/lib/crm";
import { LeadsTable } from "@/components/leads-table";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const user = await requireUser();
  const leads = listLeads(user, { due: true });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Follow-ups due</h1>
        <p className="text-sm text-slate-500">Overdue and due today, oldest first.</p>
      </div>
      <LeadsTable leads={leads} showAgent={user.role === "admin"} />
    </div>
  );
}
