import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { govScope, inScope } from "../../../../../lib/accreditation/governance";
import { vdb } from "../../../../../lib/accreditation/visit";
import { uploadEvidenceFile } from "../../../../../lib/evidenceValidation";
import { withErrors } from "../../../../../lib/apiHandler";

const MAX = 15 * 1024 * 1024;

// POST form { cycleId, id, file? | url?, name?, remove? } — attach evidence to a finding (for a rebuttal or to show it is fixed).
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const sc = await govScope(user);
  const cycle = await prisma.accreditationCycle.findUnique({ where: { id: String(form.get("cycleId") || "") } });
  if (!sc || !cycle || !inScope(sc, cycle) || !(sc.canManage || cycle.leadId === user.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await vdb.visitItem.findFirst({ where: { id: String(form.get("id") || ""), cycleId: cycle.id, kind: "FINDING" } }).catch(() => null);
  if (!f) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  let d: Record<string, unknown> = {}; try { d = JSON.parse(f.dataJson || "{}"); } catch { d = {}; }
  const list = (Array.isArray(d.evidence) ? d.evidence : []) as { name: string; url: string }[];
  const remove = String(form.get("remove") || "");
  if (remove) { d.evidence = list.filter((e) => e.url !== remove); }
  else {
    const file = form.get("file") as File | null;
    let url = String(form.get("url") || "").trim();
    let name = String(form.get("name") || "").trim().slice(0, 160);
    if (file && file.size > 0) {
      if (file.size > MAX) return NextResponse.json({ error: "The file is larger than 15 MB." }, { status: 400 });
      try { url = await uploadEvidenceFile(Buffer.from(await file.arrayBuffer()), `rebuttal-${file.name}`, file.type || "application/octet-stream"); }
      catch (e) { return NextResponse.json({ error: "Upload failed: " + (e as Error).message }, { status: 500 }); }
      name = name || file.name;
    }
    if (!url) return NextResponse.json({ error: "Choose a file or give a link." }, { status: 400 });
    if (!/^(https?:\/\/|\/)/.test(url)) return NextResponse.json({ error: "The link must start with http(s)://" }, { status: 400 });
    list.push({ name: name || url, url });
    d.evidence = list.slice(-30);
  }
  await vdb.visitItem.update({ where: { id: f.id }, data: { dataJson: JSON.stringify(d) } });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
