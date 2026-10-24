"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorText, useApi } from "./use-api";
import { STAGE_LABEL } from "@/lib/format";

const STAGES = Object.keys(STAGE_LABEL);

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-slate-500 hover:text-slate-900"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function AddLeadForm({ agents }: { agents: { id: number; name: string }[] }) {
  const { call, busy, error } = useApi();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = Object.fromEntries(new FormData(form));
        const res = await call<{ created: boolean }>("/api/leads", "POST", f);
        if (res) {
          setMsg(res.created ? "Lead added" : "A lead with this number already exists");
          if (res.created) form.reset();
        }
      }}
    >
      <h2 className="font-semibold">Add lead</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" name="name" placeholder="Name" required />
        <input className="input" name="phone" placeholder="Phone" inputMode="tel" required />
        <input className="input" name="source" placeholder="Source (e.g. website)" />
        <select className="input" name="assigned_to" defaultValue="">
          <option value="">Auto-assign</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <button className="btn" disabled={busy}>Add</button>
      {msg && !error && <p className="text-sm text-slate-600">{msg}</p>}
      <ErrorText error={error} />
    </form>
  );
}

export function ImportForm() {
  const { call, busy, error } = useApi();
  const [result, setResult] = useState<{ created: number; duplicates: number; errors: string[] } | null>(null);
  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setResult(await call("/api/leads/import", "POST", new FormData(e.currentTarget)));
      }}
    >
      <h2 className="font-semibold">Import CSV</h2>
      <p className="text-xs text-slate-500">Columns: <code>name</code>, <code>phone</code>, optional <code>source</code>. New leads are auto-assigned.</p>
      <input className="input" type="file" name="file" accept=".csv,text/csv" required />
      <button className="btn" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
      {result && (
        <div className="text-sm text-slate-600">
          {result.created} added, {result.duplicates} already existed.
          {result.errors.map((e) => <p key={e} className="text-rose-700">{e}</p>)}
        </div>
      )}
      <ErrorText error={error} />
    </form>
  );
}

export function AllocateButton({ count }: { count: number }) {
  const { call, busy, error } = useApi();
  if (!count) return null;
  return (
    <div>
      <button className="btn-ghost" disabled={busy} onClick={() => call("/api/leads/allocate")}>
        Auto-assign {count} unassigned lead{count > 1 ? "s" : ""}
      </button>
      <ErrorText error={error} />
    </div>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function LeadEditor({
  lead,
  agents,
  isAdmin,
}: {
  lead: { id: number; stage: string; next_follow_up: string | null; assigned_to: number | null };
  agents: { id: number; name: string }[];
  isAdmin: boolean;
}) {
  const { call, busy, error } = useApi();
  const url = `/api/leads/${lead.id}`;
  return (
    <div className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="stage">Stage</label>
          <select id="stage" className="input" value={lead.stage} disabled={busy} onChange={(e) => call(url, "PATCH", { stage: e.target.value })}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("when") as string;
            call(url, "PATCH", { next_follow_up: v ? new Date(v).toISOString() : null });
          }}
        >
          <label className="label" htmlFor="when">Next follow-up</label>
          <div className="flex gap-2">
            <input id="when" name="when" type="datetime-local" className="input" defaultValue={toLocalInput(lead.next_follow_up)} key={lead.next_follow_up} />
            <button className="btn-ghost" disabled={busy}>Set</button>
          </div>
        </form>
        {isAdmin && (
          <div>
            <label className="label" htmlFor="agent">Assigned to</label>
            <select id="agent" className="input" value={lead.assigned_to ?? ""} disabled={busy} onChange={(e) => call(url, "PATCH", { assigned_to: e.target.value || null })}>
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (await call(url, "PATCH", { note: new FormData(form).get("note") })) form.reset();
        }}
      >
        <label className="label" htmlFor="note">Add note</label>
        <div className="flex gap-2">
          <input id="note" name="note" className="input" placeholder="What was discussed?" required />
          <button className="btn" disabled={busy}>Save</button>
        </div>
      </form>
      <ErrorText error={error} />
    </div>
  );
}

export function AddUserForm() {
  const { call, busy, error } = useApi();
  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (await call("/api/users", "POST", Object.fromEntries(new FormData(form)))) form.reset();
      }}
    >
      <h2 className="font-semibold">Add team member</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" name="name" placeholder="Name" required />
        <input className="input" name="email" type="email" placeholder="Email" required />
        <input className="input" name="phone" placeholder="Phone (optional)" />
        <input className="input" name="password" type="text" placeholder="Temporary password (6+ chars)" minLength={6} required />
        <select className="input" name="role" defaultValue="agent">
          <option value="agent">Agent (calls leads)</option>
          <option value="admin">Admin (manages team)</option>
        </select>
      </div>
      <button className="btn" disabled={busy}>Add</button>
      <ErrorText error={error} />
    </form>
  );
}

export function UserActions({ id, active, isSelf }: { id: number; active: boolean; isSelf: boolean }) {
  const { call, busy, error } = useApi();
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={() => {
          const password = prompt("New password (6+ characters):");
          if (password) call(`/api/users/${id}`, "PATCH", { password });
        }}
      >
        Reset password
      </button>
      {!isSelf && (
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => {
            if (active && !confirm("Deactivate this user? They'll be signed out and their open leads become unassigned.")) return;
            call(`/api/users/${id}`, "PATCH", { active: !active });
          }}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}
