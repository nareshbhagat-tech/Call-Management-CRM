const dt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const fmtDate = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : "—");

export function fmtDuration(sec: number) {
  if (!sec) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h && `${h}h`, m && `${m}m`, !h && s && `${s}s`].filter(Boolean).join(" ");
}

export const STAGE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  follow_up: "Follow-up",
  won: "Won",
  lost: "Lost",
};

export const STAGE_STYLE: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  contacted: "bg-slate-200 text-slate-800",
  interested: "bg-amber-100 text-amber-800",
  follow_up: "bg-violet-100 text-violet-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-rose-100 text-rose-800",
};

export const STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-500",
  on_call: "bg-amber-500",
  break: "bg-slate-400",
  offline: "bg-slate-300",
};
