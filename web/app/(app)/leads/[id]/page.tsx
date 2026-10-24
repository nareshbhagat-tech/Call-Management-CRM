import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/api";
import { activeAgents, leadForUser, timeline } from "@/lib/crm";
import { fmtDate, fmtDuration, STAGE_LABEL, STAGE_STYLE } from "@/lib/format";
import { LeadEditor } from "@/components/forms";

export const dynamic = "force-dynamic";

const DIRECTION_LABEL: Record<string, string> = { outgoing: "Outgoing call", incoming: "Incoming call", missed: "Missed call", rejected: "Rejected call" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  let lead;
  try {
    lead = leadForUser(Number((await params).id), user);
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
  const items = timeline(lead.id);
  const isAdmin = user.role === "admin";
  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-900">← Leads</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{lead.name}</h1>
        <span className={`pill ${STAGE_STYLE[lead.stage]}`}>{STAGE_LABEL[lead.stage]}</span>
      </div>
      <p className="text-sm text-slate-600">
        <a className="font-medium text-teal-800 hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>
        {lead.source && <> · Source: {lead.source}</>} · Added {fmtDate(lead.created_at.replace(" ", "T") + "Z")}
      </p>
      <LeadEditor lead={lead} agents={isAdmin ? activeAgents() : []} isAdmin={isAdmin} />

      <section>
        <h2 className="mb-2 font-semibold">Timeline</h2>
        {items.length ? (
          <ol className="card divide-y divide-slate-100 p-0">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500">
                  <span>{it.agent_name}</span>
                  <time>{fmtDate(it.at)}</time>
                </div>
                {it.kind === "note" ? (
                  <p className="text-sm">{it.text}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {DIRECTION_LABEL[it.direction]} · {it.duration_sec ? fmtDuration(it.duration_sec) : "not connected"}
                      {it.outcome && <span className="font-normal text-slate-600"> · {it.outcome}</span>}
                    </p>
                    {it.recording_file && <audio controls preload="none" className="w-full max-w-md" src={`/api/calls/${it.id}/recording`} />}
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="card text-sm text-slate-500">No calls or notes yet.</p>
        )}
      </section>
    </div>
  );
}
