// A small cache for data read on almost every page (institute settings, menu titles, branding, module locks …).
// Two layers: an in-memory map in this server instance (instant), and — when UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set — Redis shared by every instance (Upstash's REST API: plain fetch, no package).
// Without Redis it still works, per instance. Values must be JSON-safe; a Redis failure never breaks a page.

type Entry = { v: unknown; until: number };
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX = 2000;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
export const redisOn = () => !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd: (string | number)[]): Promise<unknown> {
  if (!redisOn()) return null;
  try {
    const r = await fetch(REDIS_URL, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(800), cache: "no-store" });
    if (!r.ok) return null;
    return ((await r.json()) as { result?: unknown }).result ?? null;
  } catch { return null; }
}

/**
 * The value for `key`, computed by `fn` at most once per `ttlSec` (and only once at a time: callers asking while it is
 * being computed share the same promise — no duplicate database work).
 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.until > now) return hit.v as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = (async () => {
    const fromRedis = await redis(["GET", `obe:${key}`]);
    if (typeof fromRedis === "string") { try { const v = JSON.parse(fromRedis) as T; put(key, v, ttlSec); return v; } catch { /* recompute */ } }
    const v = await fn();
    put(key, v, ttlSec);
    if (redisOn()) void redis(["SET", `obe:${key}`, JSON.stringify(v ?? null), "EX", Math.max(1, Math.round(ttlSec))]);
    return v;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p as Promise<T>;
}
function put(key: string, v: unknown, ttlSec: number) {
  if (mem.size >= MAX) { const first = mem.keys().next().value; if (first !== undefined) mem.delete(first); }
  mem.set(key, { v, until: Date.now() + ttlSec * 1000 });
}
/** Forget a key (after the data behind it changed); a prefix ending in "*" forgets every key that starts with it here. */
export async function invalidate(key: string) {
  if (key.endsWith("*")) { const p = key.slice(0, -1); for (const k of Array.from(mem.keys())) if (k.startsWith(p)) mem.delete(k); return; }
  mem.delete(key);
  await redis(["DEL", `obe:${key}`]);
}
