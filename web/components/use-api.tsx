"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Calls our JSON API, shows errors, and refreshes server-rendered data on success. */
export function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T = unknown>(url: string, method = "POST", body?: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body instanceof FormData
          ? { body }
          : body !== undefined && { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return null;
      }
      router.refresh();
      return data as T;
    } catch {
      setError("Network error — check your connection");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { call, busy, error };
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null;
}
