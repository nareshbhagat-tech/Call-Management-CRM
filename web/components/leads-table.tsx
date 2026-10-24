import Link from "next/link";
import type { LeadRow } from "@/lib/crm";
import { fmtDate, STAGE_LABEL, STAGE_STYLE } from "@/lib/format";

export function LeadsTable({ leads, showAgent }: { leads: LeadRow[]; showAgent: boolean }) {
  if (!leads.length) return <p className="card text-sm text-slate-500">No leads here.</p>;
  const now = new Date().toISOString();
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="th">Name</th>
            <th className="th">Phone</th>
            <th className="th">Stage</th>
            {showAgent && <th className="th">Agent</th>}
            <th className="th">Follow-up</th>
            <th className="th">Last call</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <td className="td font-medium"><Link className="text-teal-800 hover:underline" href={`/leads/${l.id}`}>{l.name}</Link></td>
              <td className="td"><a className="hover:underline" href={`tel:${l.phone}`}>{l.phone}</a></td>
              <td className="td"><span className={`pill ${STAGE_STYLE[l.stage]}`}>{STAGE_LABEL[l.stage]}</span></td>
              {showAgent && <td className="td text-slate-600">{l.agent_name ?? <span className="text-rose-700">Unassigned</span>}</td>}
              <td className={`td ${l.next_follow_up && l.next_follow_up < now && !["won", "lost"].includes(l.stage) ? "font-medium text-rose-700" : "text-slate-600"}`}>
                {fmtDate(l.next_follow_up)}
              </td>
              <td className="td text-slate-600">{fmtDate(l.last_call_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
