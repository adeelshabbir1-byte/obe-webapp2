import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, rdb, str } from "../../../lib/registers";
import { PdfDoc, GREEN, RED, AMBER } from "../../../lib/pdfDoc";
import { titlesFor, applyTitles } from "../../../lib/titles";
import { DASH_ROLES, DASH_HINT, DEFAULT_TARGETS, latestSnapshot, refreshDashboard, scopeOf, inScope, figures, light, targetsOf, fmtFigure } from "../../../lib/headDashboard";

export const maxDuration = 60;

async function who() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !DASH_ROLES.includes(user.role)) return null;
  const w = await whoIs(user as never);
  return w ? { user, w } : null;
}

/** GET ?dept=&program= — the dashboard as a PDF for the Board / Syndicate. */
export async function GET(req: Request) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const snap = await latestSnapshot(me.w.chairmanId);
  if (snap === "missing") return NextResponse.json({ error: DASH_HINT }, { status: 500 });
  if (!snap) return NextResponse.json({ error: "The figures have not been worked out yet — open the dashboard first." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const sc = scopeOf(me.user as never, snap, q.get("dept"), q.get("program"));
  const figs = figures(snap, sc, await targetsOf(me.w.chairmanId));
  const titles = await titlesFor(me.w.chairmanId);
  const { programs } = inScope(snap, sc);
  const area = sc.program || (sc.departmentIds ? snap.departments.filter((d) => sc.departmentIds!.includes(d.departmentId)).map((d) => d.name).join(", ") || "—" : "Whole institute");
  const d = await PdfDoc.create(`Institute dashboard - ${area}`);
  d.title(applyTitles("Institute Head dashboard", titles), `${area} - figures as at ${new Date(snap.computedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`);
  const colour = { green: GREEN, amber: AMBER, red: RED, grey: undefined } as const;
  d.table([["Figure", 3], ["Now", 1.2], ["Target", 1.2], ["Before", 1.6], ["Status", 1], ["Detail", 5]],
    figs.map((f) => [f.label, fmtFigure(f), f.target === null ? "-" : `${f.better === "down" ? "at most" : "at least"} ${fmtFigure(f, f.target)}`, f.before === null ? "-" : `${fmtFigure(f, f.before)} (${f.beforeLabel})`, { green: "On target", amber: "Close", red: "Below target", grey: "-" }[light(f)], f.sub]),
    { size: 8, colour: (r, c) => (c === 4 ? colour[light(figs[r])] : undefined) });
  d.h1("By program");
  d.table([["Program", 3], ["Students", 1.2], ["Pass rate", 1.2], ["CLO", 1], ["Readiness", 1.3], ["Left this year", 1.4], ["Warning / probation", 1.6], ["Next visit", 1.8]],
    programs.map((p) => [p.program, p.enrolled, p.results.cur.students ? `${Math.round((100 * p.results.cur.pass) / p.results.cur.students)}%` : "-", p.clo.cur.total ? `${Math.round((100 * p.clo.cur.pass) / p.clo.cur.total)}%` : "-", p.readiness === null ? "-" : `${p.readiness}%`, Object.entries(p.moved.cur).filter(([k]) => ["DROPPED", "LEFT", "TRANSFER_OUT", "RUSTICATED"].includes(k)).reduce((t, [, v]) => t + v, 0), `${p.warning} / ${p.probation}`, p.nextVisit ? new Date(p.nextVisit).toLocaleDateString("en-GB") : "-"]));
  d.note("Targets are set by the Institute Head. Figures are worked out every night from the records in OBEHUB; 'before' is the previous term or the previous calendar year.");
  await writeAuditLog({ actorUserId: me.user.id, action: "DASHBOARD_EXPORTED", entityType: "Dashboard", entityId: me.w.chairmanId, metadata: { area } }).catch(() => {});
  return new NextResponse(Buffer.from(await d.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Institute dashboard - ${area.replace(/[^\w ,()-]/g, "").slice(0, 60)}.pdf"` } });
}

/** POST { action: "refresh" } — work the figures out now;  { action: "target", key, target } — the Institute Head. */
export async function POST(req: Request) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "refresh") {
    const last = await latestSnapshot(me.w.chairmanId);
    if (last === "missing") return NextResponse.json({ error: DASH_HINT }, { status: 500 });
    if (last && Date.now() - new Date(last.computedAt).getTime() < 5 * 60_000) return NextResponse.json({ ok: true, note: "Worked out less than five minutes ago." });
    try { await refreshDashboard(me.w.chairmanId); } catch (e) { return NextResponse.json({ error: `Could not work the figures out: ${String((e as Error).message || e).slice(0, 200)}` }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  }
  if (b.action === "target") {
    if (!me.w.head) return NextResponse.json({ error: "Only the Institute Head sets the targets." }, { status: 403 });
    const key = str(b.key);
    if (!(key in DEFAULT_TARGETS)) return NextResponse.json({ error: "Unknown figure." }, { status: 400 });
    const target = Number(b.target);
    if (!Number.isFinite(target) || target < 0 || target > 1e9) return NextResponse.json({ error: "Give a number." }, { status: 400 });
    try {
      await rdb.dashboardTarget.upsert({ where: { chairmanId_key: { chairmanId: me.w.chairmanId, key } }, create: { id: randomUUID(), chairmanId: me.w.chairmanId, key, target, updatedById: me.user.id }, update: { target, updatedById: me.user.id, updatedAt: new Date() } });
    } catch { return NextResponse.json({ error: DASH_HINT }, { status: 500 }); }
    await writeAuditLog({ actorUserId: me.user.id, action: "DASHBOARD_TARGET_SET", entityType: "DashboardTarget", entityId: key, metadata: { target } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
