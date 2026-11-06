"use client";
import { useEffect, useState } from "react";

// Browser-side helpers against duplicate and stale API calls.
const inflight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { at: number; v: unknown }>();

/**
 * GET JSON once: callers asking for the same URL at the same time share one request, and an answer younger than
 * `ttlMs` is reused (0 = only share the request in flight).
 */
export function getJson<T = unknown>(url: string, opts: { ttlMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const hit = recent.get(url);
  if (hit && opts.ttlMs && Date.now() - hit.at < opts.ttlMs) return Promise.resolve(hit.v as T);
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const p = fetch(url, { cache: "no-store", signal: opts.signal })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((d as { error?: string }).error || `Failed (${r.status})`), { status: r.status }); recent.set(url, { at: Date.now(), v: d }); return d as T; })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}
/** Forget cached answers whose URL starts with `prefix` (after saving something they show). */
export function forget(prefix: string) { for (const k of Array.from(recent.keys())) if (k.startsWith(prefix)) recent.delete(k); }

/** The value, settled: it changes only after `ms` without a new change (for search and autocomplete boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
