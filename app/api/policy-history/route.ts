import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, rdb, str, dateOrNull } from "../../../lib/registers";
import { POL_HINT, KINDS, canEditPolicies } from "../../../lib/policyHistory";
import { REVIEW_ROLES } from "../../../lib/reviewScope";
import { withErrors } from "../../../lib/apiHandler";

/** GET ?file=<versionId> — the approved document of a version. */
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  const v = w ? await rdb.policyVersion.findUnique({ where: { id: String(new URL(req.url).searchParams.get("file") || "") } }).catch(() => null) : null;
  const d = v ? await rdb.policyDoc.findUnique({ where: { id: v.docId } }) : null;
  if (!w || !v || !d || d.chairmanId !== w.chairmanId || !v.fileData) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(v.fileData, "base64"), { headers: { "Content-Type": v.fileMime || "application/pdf", "Content-Disposition": `attachment; filename="${String(v.fileName || "policy.pdf").replace(/[^\w .()-]+/g, "")}"` } });
}

/** POST JSON { action: "doc", kind, title, program } — a new policy / manual / curriculum.
 *  POST multipart { docId, version, summary, bosMeeting, bosDate, bosMinute, acMeeting, acDate, acMinute, effectiveFrom, link, file } — a version. */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !canEditPolicies(w) || !(REVIEW_ROLES.includes(user.role) || w.qec)) return NextResponse.json({ error: "Only the institute head, Dean, HOD, Program Lead or QEC In-charge records policies." }, { status: 403 });
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      const title = str(b.title, 200);
      if (!title) return NextResponse.json({ error: "Give the title." }, { status: 400 });
      const id = randomUUID();
      await rdb.policyDoc.create({ data: { id, chairmanId: w.chairmanId, kind: KINDS[String(b.kind)] ? String(b.kind) : "POLICY", title, program: str(b.program, 120) || null, createdById: w.id } });
      await writeAuditLog({ actorUserId: w.id, action: "POLICY_DOC_ADDED", entityType: "PolicyDoc", entityId: id, metadata: {} });
      return NextResponse.json({ ok: true, id });
    }
    const f = await req.formData();
    const g = (k: string) => (typeof f.get(k) === "string" ? String(f.get(k)) : "");
    const d = await rdb.policyDoc.findUnique({ where: { id: g("docId") } });
    if (!d || d.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    const version = str(g("version"), 40);
    if (!version) return NextResponse.json({ error: "Give the version (e.g. 2.0 or 2024)." }, { status: 400 });
    const file = f.get("file") as File | null;
    let fileData: string | null = null, fileName: string | null = null, fileMime: string | null = null;
    if (file && file.size) {
      if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "The file is larger than 3 MB; give a link instead." }, { status: 400 });
      fileData = Buffer.from(await file.arrayBuffer()).toString("base64"); fileName = file.name.slice(0, 160); fileMime = file.type || "application/pdf";
    }
    const link = str(g("link"), 1000);
    if (link && !/^https?:\/\//.test(link)) return NextResponse.json({ error: "The link should start with https://" }, { status: 400 });
    const id = randomUUID();
    await rdb.policyVersion.create({ data: { id, docId: d.id, version, summary: str(g("summary"), 3000) || null, bosMeeting: str(g("bosMeeting"), 80) || null, bosDate: dateOrNull(g("bosDate")), bosMinute: str(g("bosMinute"), 40) || null, acMeeting: str(g("acMeeting"), 80) || null, acDate: dateOrNull(g("acDate")), acMinute: str(g("acMinute"), 40) || null, effectiveFrom: dateOrNull(g("effectiveFrom")), link: link || null, fileName, fileMime, fileData, createdById: w.id } });
    await writeAuditLog({ actorUserId: w.id, action: "POLICY_VERSION_ADDED", entityType: "PolicyDoc", entityId: d.id, metadata: { version } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? POL_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
