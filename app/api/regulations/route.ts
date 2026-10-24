import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { REG_HINT, rdb, submit, uploadLink, attachFile, confirmMou, review, withdraw, addClause, link, deleteClause, canSee, type RegDoc } from "../../../lib/regulations";
import { seedStarter } from "../../../lib/regulationsSeed";

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: submit | uploadLink | attach | confirm | publish | reject | withdraw | clause | link | unlink | deleteClause | seed }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, message, ...extra });
  try {
    switch (b.action) {
      case "submit": { const id = await submit(user, b); return ok("Submitted — attach the PDF and screenshots, then it goes for publishing.", { id }); }
      case "uploadLink": {
        const d = (await rdb.regDocument.findUnique({ where: { id: str(b.docId, 60) } })) as RegDoc | null;
        if (!d || !(await canSee(user, d))) throw new Error("Not found.");
        return ok("", await uploadLink(d.id, str(b.name, 200)));
      }
      case "attach": await attachFile(user, str(b.docId, 60), { path: str(b.path, 400), name: str(b.name, 200), mime: str(b.mime, 60), size: Number(b.size) || 0, caption: str(b.caption, 300) }); return ok("File added.");
      case "confirm": return ok(await confirmMou(user, str(b.id, 60)));
      case "publish": return ok(await review(user, str(b.id, 60), true, str(b.note, 500)));
      case "reject": return ok(await review(user, str(b.id, 60), false, str(b.note, 500)));
      case "withdraw": return ok(await withdraw(user, str(b.id, 60)));
      case "clause": { const targets = Object.keys(b).filter((k) => k.startsWith("t:") && b[k] === true).map((k) => k.slice(2)); await addClause(user, str(b.docId, 60), { ref: str(b.ref, 120), page: b.page, quote: str(b.quote, 4000), imageFileId: str(b.imageFileId, 60) || undefined, targets }); return ok("Clause added."); }
      case "link": case "unlink": await link(user, str(b.clauseId, 60), str(b.target, 120), b.action === "link"); return ok(b.action === "link" ? "Linked." : "Removed.");
      case "deleteClause": await deleteClause(user, str(b.clauseId, 60)); return ok("Clause removed.");
      case "seed": { if (user.role !== "SUPER_USER") throw new Error("Only the Super Admin loads the starter documents."); return ok(await seedStarter(user)); }
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: REG_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
