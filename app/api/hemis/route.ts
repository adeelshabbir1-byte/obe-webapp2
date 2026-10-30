import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { hemisData, hemisWorkbook, hemisCsv, hemisSummary, datasetOf, saveHemisCode, logHemis, HEMIS_HINT, DATASETS, HEMIS_ROLES, type Dataset } from "../../../lib/hemis";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 60;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET ?dataset=all|students|faculty|programs|enrolment|results|graduates&format=xlsx|csv&only=ready */
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !HEMIS_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user);
  if (!cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const ds = q.get("dataset") || "all";
  const one = ds === "all" ? null : datasetOf(ds);
  if (ds !== "all" && !one) return NextResponse.json({ error: "Unknown data set" }, { status: 400 });
  const { out } = await hemisData(cid, one ? [one.key] : undefined);
  const ready = q.get("only") === "ready";
  const pick = (k: Dataset) => (ready ? out[k].filter((r) => !r.issues.some((i) => i.severity === "reject")) : out[k]);
  const keys = one ? [one.key] : DATASETS.map((d) => d.key);
  const rows = keys.reduce((t, k) => t + pick(k).length, 0), rejected = ready ? 0 : keys.reduce((t, k) => t + hemisSummary(out[k]).rejected, 0);
  await logHemis({ chairmanId: cid, dataset: one ? one.key : "all", rows, rejected, byId: user.id });
  await writeAuditLog({ actorUserId: user.id, action: "HEMIS_EXPORTED", entityType: "HemisExportLog", entityId: one ? one.key : "all", metadata: { rows, rejected } });
  const stamp = new Date().toISOString().slice(0, 10);
  if (one && q.get("format") === "csv") return new NextResponse(hemisCsv(one, pick(one.key)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="HEMIS ${one.title} ${stamp}.csv"` } });
  const buf = await hemisWorkbook(Object.fromEntries(keys.map((k) => [k, pick(k)])));
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="HEMIS ${one ? one.title : "data"} ${stamp}.xlsx"` } });
}

/** POST { action: "code", program ("" = the institute), code, level, discipline, years } — the HEMIS codes. */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !["CHAIRMAN", "DEAN"].includes(user.role)) return NextResponse.json({ error: "Only the institute head or Dean sets the HEMIS codes." }, { status: 403 });
  const cid = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  if (b.action !== "code" || !cid) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const program = typeof b.program === "string" ? b.program.slice(0, 120) : "";
  const code = typeof b.code === "string" ? b.code : "";
  if (code && !/^[A-Za-z0-9\-/ .]{1,40}$/.test(code.trim())) return NextResponse.json({ error: "A HEMIS code has letters, digits, - and / only." }, { status: 400 });
  try { await saveHemisCode(cid, program, { code, level: b.level, discipline: b.discipline, years: Number(b.years) || undefined }, user.id); } catch { return NextResponse.json({ error: HEMIS_HINT }, { status: 500 }); }
  await writeAuditLog({ actorUserId: user.id, action: "HEMIS_CODE_SET", entityType: "HemisCode", entityId: program || "institute", metadata: { code: code.trim() } });
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
