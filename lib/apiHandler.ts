import { NextResponse } from "next/server";
import { makeRef, reportServerError } from "./monitoring";

// One wrapper for every API route: an unexpected error becomes { error: "<plain message>", ref } with the right
// status, and the same reference code goes to the log (and Sentry when it is on). People never see a stack trace or a
// database message. Next.js redirects / not-found signals pass through untouched.

export const MIGRATION_MESSAGE = "This feature needs a database update — ask the administrator to run migrations (System Health).";

/** Plain message and status for an error. */
export function describeError(e: unknown, ref: string): { status: number; error: string } {
  const x = e as { code?: string; name?: string; message?: string; meta?: unknown };
  const msg = String(x?.message || "");
  if (x?.code === "P2021" || x?.code === "P2022" || /relation .* does not exist|table .* does not exist|column .* does not exist|The table `.*` does not exist|The column `.*` does not exist/i.test(msg)) return { status: 503, error: MIGRATION_MESSAGE };
  if (x?.code === "P2025") return { status: 404, error: "Not found — it may have been removed." };
  if (x?.code === "P2002") return { status: 409, error: "This already exists." };
  if (x?.code === "P2003") return { status: 409, error: "This is still used elsewhere, so it can't be changed or removed." };
  if (x?.code === "P1001" || x?.code === "P1002" || x?.code === "P2024" || /Can't reach database server|Timed out fetching a new connection/i.test(msg)) return { status: 503, error: `The database is busy or unreachable. Please try again in a minute. (Reference ${ref})` };
  if (x?.name === "SyntaxError" && /JSON/i.test(msg)) return { status: 400, error: "The request could not be read." };
  return { status: 500, error: `Something went wrong. Please try again; if it keeps happening, report it with reference ${ref}.` };
}

/** Next.js uses thrown values for redirect(), notFound() and dynamic rendering — those must not be caught. */
export function isNextSignal(e: unknown) {
  const d = (e as { digest?: unknown })?.digest;
  const m = String((e as { message?: unknown })?.message || "");
  return (typeof d === "string" && (d.startsWith("NEXT_") || d === "DYNAMIC_SERVER_USAGE")) || m.includes("Dynamic server usage") || m === "NEXT_NOT_FOUND";
}

export function withErrors<A extends unknown[], R>(fn: (...args: A) => Promise<R> | R) {
  return async (...args: A): Promise<R | NextResponse> => {
    try {
      const res = await fn(...args);
      // File downloads: CNICs masked, the export logged, bulk student exports limited (lib/exportGuard.ts).
      if (res instanceof Response && res.headers.get("content-disposition")) {
        const { guardExport } = await import("./exportGuard");
        return (await guardExport(res, args[0] as Request | undefined)) as R;
      }
      return res;
    } catch (e) {
      if (isNextSignal(e)) throw e;
      const ref = makeRef();
      const req = args[0] as { url?: string; method?: string } | undefined;
      const out = describeError(e, ref);
      await reportServerError(e, { ref, route: `${req?.method || ""} ${req?.url ? new URL(req.url, "http://x").pathname : ""}`.trim(), kind: out.status === 503 ? "db" : "api" }).catch(() => null);
      return NextResponse.json({ error: out.error, ref }, { status: out.status });
    }
  };
}
