import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dashboard, effectiveStatus } from "@/lib/crm";
import { fmtDate, fmtDuration, STAGE_LABEL, STATUS_STYLE } from "@/lib/format";
import { STAGES } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/leads");
  const { agents, stages, unassigned } = dashboard();
  const totals = agents.reduce((t, a) => ({ calls: t.calls + a.calls, connected: t.connected + a.connected, talk: t.talk + a.talk_sec, due: t.due + a.due_follow_ups }), { calls: 0, connected: 0, talk: 0, due: 0 });
  const stageCount = Object.fromEntries(stages.map((s) => [s.stage, s.n]));
  const tiles = [
    { label: "Calls today", value: totals.calls },
    { label: "Connected", value: totals.calls ? `${totals.connected} (${Math.round((totals.connected / totals.calls) * 100)}%)` : 0 },
    { label: "Talk time", value: fmtDuration(totals.talk) },
    { label: "Follow-ups due", value: totals.due },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-xs text-slate-500">Refresh the page for the latest numbers</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold">{t.value}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Team</h2>
        {agents.length ? (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Agent</th><th className="th">Status</th><th className="th">Calls</th>
                  <th className="th">Connected</th><th className="th">Talk time</th><th className="th">Open leads</th><th className="th">Follow-ups due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((a) => {
                  const status = effectiveStatus(a.status, a.last_seen);
                  return (
                    <tr key={a.id}>
                      <td className="td font-medium"><Link className="text-teal-800 hover:underline" href={`/leads?agent=${a.id}`}>{a.name}</Link></td>
                      <td className="td">
                        <span className="inline-flex items-center gap-2" title={`Last seen ${fmtDate(a.last_seen)}`}>
                          <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[status]}`} />
                          {status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="td">{a.calls}</td>
                      <td className="td">{a.connected}</td>
                      <td className="td">{fmtDuration(a.talk_sec)}</td>
                      <td className="td">{a.open_leads}</td>
                      <td className={`td ${a.due_follow_ups ? "font-medium text-rose-700" : ""}`}>{a.due_follow_ups}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="card text-sm text-slate-500">No agents yet. <Link className="text-teal-800 underline" href="/users">Add your team</Link>.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Pipeline</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {STAGES.map((s) => (
            <Link key={s} href={`/leads?stage=${s}`} className="card hover:border-teal-600">
              <p className="text-xs text-slate-500">{STAGE_LABEL[s]}</p>
              <p className="mt-1 text-xl font-semibold">{stageCount[s] ?? 0}</p>
            </Link>
          ))}
        </div>
        {unassigned > 0 && (
          <p className="mt-3 text-sm text-rose-700"><Link className="underline" href="/leads?agent=none">{unassigned} lead{unassigned > 1 ? "s are" : " is"} unassigned</Link></p>
        )}
      </section>
    </div>
  );
}
