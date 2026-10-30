import { scrubEvent, scrubText, scrubUrl } from "./scrub";

// Error monitoring with Sentry — on only when SENTRY_DSN is set (nothing is loaded or sent otherwise). Events carry the
// user id, role and institute and an error reference code; never names, CNICs, marks, request bodies or query strings.

export const monitoringOn = () => !!process.env.SENTRY_DSN;
export const release = () => process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_RELEASE || "dev";
export const tracesRate = () => { const n = Number(process.env.SENTRY_TRACES_SAMPLE_RATE); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.1; };

/** A short code shown to the person and written to the log / Sentry, e.g. E-7K2Q9X. */
export function makeRef() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return `E-${s}`;
}

let ready: Promise<typeof import("@sentry/nextjs") | null> | null = null;
/** Starts Sentry once (server or edge). */
export function initServerMonitoring() {
  if (!monitoringOn()) return null;
  ready ||= import("@sentry/nextjs").then((S) => {
    S.init({
      dsn: process.env.SENTRY_DSN, release: release(), environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      tracesSampleRate: tracesRate(), sendDefaultPii: false,
      beforeSend: (e) => scrubEvent(e as never),
      beforeSendTransaction: (e) => scrubEvent(e as never),
    });
    return S;
  }).catch(() => null);
  return ready;
}

export type ErrorContext = { ref: string; route?: string; userId?: string | null; role?: string | null; institute?: string | null; kind?: string };
/** Logs a server error with its reference code (one line, no personal data), and sends it to Sentry when on. */
export async function reportServerError(err: unknown, ctx: ErrorContext) {
  const e = err as { name?: string; code?: string; message?: string; stack?: string };
  console.error(`[error ref=${ctx.ref}] ${ctx.kind || "server"} ${scrubUrl(ctx.route || "")} ${e?.name || ""}${e?.code ? ` ${e.code}` : ""}: ${scrubText(String(e?.message || err)).slice(0, 500)}`);
  const S = await initServerMonitoring();
  if (!S) return;
  S.withScope((scope) => {
    scope.setTag("ref", ctx.ref);
    if (ctx.route) scope.setTag("route", scrubUrl(ctx.route));
    if (ctx.kind) scope.setTag("kind", ctx.kind);
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.role) scope.setTag("role", ctx.role);
    if (ctx.institute) scope.setTag("institute", ctx.institute);
    S.captureException(err instanceof Error ? err : new Error(scrubText(String(err))));
  });
  await S.flush(1500).catch(() => false);
}
