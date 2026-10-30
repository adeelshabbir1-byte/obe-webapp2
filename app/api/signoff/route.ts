import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, rdb, str } from "../../../lib/registers";
import { SIGN_HINT } from "../../../lib/signoff";
import { withErrors } from "../../../lib/apiHandler";

const MAX = 300 * 1024;

/**
 * POST multipart { kind: SIGNATURE | STAMP, file } — your own signature image (any member of staff) or the institute
 *   stamp (the Institute Head). PNG or JPEG, up to 300 KB. Placed only on documents the person actually approved.
 * POST JSON { action: "revoke", id, reason } | { action: "removeAsset", kind } .
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const fd = await req.formData();
    const kind = String(fd.get("kind") || "SIGNATURE") === "STAMP" ? "STAMP" : "SIGNATURE";
    if (kind === "STAMP" && !w.head) return NextResponse.json({ error: "Only the Institute Head uploads the institute stamp." }, { status: 403 });
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) return NextResponse.json({ error: "Choose a PNG or JPEG image." }, { status: 400 });
    if (!["image/png", "image/jpeg"].includes(f.type)) return NextResponse.json({ error: "Use a PNG or JPEG image." }, { status: 400 });
    if (f.size > MAX) return NextResponse.json({ error: "The image is larger than 300 KB." }, { status: 400 });
    const data = Buffer.from(await f.arrayBuffer()).toString("base64");
    const userId = kind === "STAMP" ? null : user.id;
    try {
      const old = await rdb.signatureAsset.findFirst({ where: { chairmanId: w.chairmanId, userId, kind } });
      if (old) await rdb.signatureAsset.update({ where: { id: old.id }, data: { mime: f.type, data, uploadedById: user.id, uploadedAt: new Date() } });
      else await rdb.signatureAsset.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, userId, kind, mime: f.type, data, uploadedById: user.id } });
    } catch { return NextResponse.json({ error: SIGN_HINT }, { status: 500 }); }
    await writeAuditLog({ actorUserId: user.id, action: kind === "STAMP" ? "STAMP_UPLOADED" : "SIGNATURE_UPLOADED", entityType: "SignatureAsset", entityId: userId || w.chairmanId, metadata: { bytes: f.size } });
    return NextResponse.json({ ok: true });
  }

  const b = await req.json().catch(() => ({}));
  if (b.action === "removeAsset") {
    const kind = b.kind === "STAMP" ? "STAMP" : "SIGNATURE";
    if (kind === "STAMP" && !w.head) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await rdb.signatureAsset.deleteMany({ where: { chairmanId: w.chairmanId, userId: kind === "STAMP" ? null : user.id, kind } }).catch(() => {});
    await writeAuditLog({ actorUserId: user.id, action: kind === "STAMP" ? "STAMP_REMOVED" : "SIGNATURE_REMOVED", entityType: "SignatureAsset", entityId: user.id, metadata: {} });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "revoke") {
    if (!(w.head || w.exam)) return NextResponse.json({ error: "Only the Institute Head or the Controller of Examinations can withdraw documents." }, { status: 403 });
    const reason = str(b.reason || b.note, 300);
    if (reason.length < 3) return NextResponse.json({ error: "Say why it is withdrawn (the verification page shows it)." }, { status: 400 });
    try {
      const d = await rdb.signedDocument.findUnique({ where: { id: str(b.id) } });
      if (!d || d.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Not found." }, { status: 404 });
      if (d.revokedAt) return NextResponse.json({ error: "Already withdrawn." }, { status: 400 });
      await rdb.signedDocument.update({ where: { id: d.id }, data: { revokedAt: new Date(), revokedById: user.id, revokeReason: reason } });
      await writeAuditLog({ actorUserId: user.id, action: "DOCUMENT_REVOKED", entityType: "SignedDocument", entityId: d.docNo, metadata: { reason } });
      return NextResponse.json({ ok: true });
    } catch { return NextResponse.json({ error: SIGN_HINT }, { status: 500 }); }
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
