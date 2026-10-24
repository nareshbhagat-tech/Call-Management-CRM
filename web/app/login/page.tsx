"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError("Network error — check your connection");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Sign-in failed");
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Call CRM</h1>
          <p className="text-sm text-slate-500">Sign in to manage leads and calls</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
