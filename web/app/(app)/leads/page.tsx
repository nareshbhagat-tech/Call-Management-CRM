import { requireUser } from "@/lib/auth";
import { activeAgents, listLeads } from "@/lib/crm";
import { STAGES } from "@/lib/db";
import { STAGE_LABEL } from "@/lib/format";
import { LeadsTable } from "@/components/leads-table";
import { AddLeadForm, AllocateButton, ImportForm } from "@/components/forms";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isAdmin = user.role === "admin";
  const leads = listLeads(user, { q: sp.q, stage: sp.stage, agent: sp.agent });
  const agents = isAdmin ? activeAgents() : [];
  const unassigned = isAdmin ? (db.prepare("SELECT COUNT(*) n FROM leads WHERE assigned_to IS NULL").get() as { n: number }).n : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{isAdmin ? "All leads" : "My leads"}</h1>
        <AllocateButton count={unassigned} />
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" placeholder="Search name or phone" defaultValue={sp.q} />
        <select className="input w-auto" name="stage" defaultValue={sp.stage ?? ""}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
        {isAdmin && (
          <select className="input w-auto" name="agent" defaultValue={sp.agent ?? ""}>
            <option value="">All agents</option>
            <option value="none">Unassigned</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button className="btn-ghost">Filter</button>
      </form>
      <LeadsTable leads={leads} showAgent={isAdmin} />
      {leads.length === 500 && <p className="text-xs text-slate-500">Showing the 500 most recently updated leads. Use search or filters to narrow down.</p>}
      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <AddLeadForm agents={agents} />
          <ImportForm />
        </div>
      )}
    </div>
  );
}
