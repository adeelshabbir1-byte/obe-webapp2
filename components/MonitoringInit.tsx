"use client";
import { useEffect } from "react";
import { scrubEvent } from "../lib/scrub";

// Browser side of error monitoring: loads Sentry only when a DSN was configured at build time (SENTRY_DSN), tags events
// with the signed-in user's id, role and institute (no names), and scrubs every event before it is sent.
export default function MonitoringInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    let cancelled = false;
    import("@sentry/nextjs").then(async (S) => {
      if (cancelled) return;
      S.init({
        dsn, release: process.env.NEXT_PUBLIC_RELEASE || undefined, tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES || "0.1"),
        sendDefaultPii: false, beforeSend: (e) => scrubEvent(e as never), beforeBreadcrumb: (b) => (b.category === "console" ? null : b),
      });
      (window as unknown as { __obeSentry?: unknown }).__obeSentry = S;
      const r = await fetch("/api/monitoring/context").then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (r?.id) { S.setUser({ id: r.id }); if (r.role) S.setTag("role", r.role); if (r.institute) S.setTag("institute", r.institute); }
    }).catch(() => null);
    return () => { cancelled = true; };
  }, []);
  return null;
}
