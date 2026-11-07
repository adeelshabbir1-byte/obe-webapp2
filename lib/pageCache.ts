import { createHash } from "crypto";
import { unstable_cache, revalidateTag } from "next/cache";

// Item 23 (speed): figures that are heavy to work out are kept for a few minutes (shared across server instances)
// instead of being rebuilt on every visit. Dates survive the round trip; Maps and Sets must be rebuilt by the caller.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const keyOf = (xs: string[]) => createHash("sha1").update(xs.slice().sort().join("|")).digest("hex").slice(0, 16);
export async function cached<T>(parts: string[], tag: string, seconds: number, fn: () => Promise<T>): Promise<{ value: T; at: Date }> {
  // The test run (its own database) always works figures out fresh, so a test sees what it just changed.
  if (process.env.E2E_DATABASE_URL) return { value: JSON.parse(JSON.stringify(await fn()), (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as T, at: new Date() };
  const raw = await unstable_cache(async () => JSON.stringify({ value: await fn(), at: new Date() }), parts, { revalidate: seconds, tags: [tag] })();
  return JSON.parse(raw, (_k, v) => (typeof v === "string" && ISO.test(v) ? new Date(v) : v)) as { value: T; at: Date };
}
export const refreshTag = (tag: string) => revalidateTag(tag);
export const homeTag = (chairmanId: string) => `home:${chairmanId}`;
