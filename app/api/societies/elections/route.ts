import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { decideCandidate, decidePlan, publish, saveElection, SCOPES, ELECTION_HINT } from "../../../../lib/elections";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Societies Head (Student Affairs / Institute Head): open or edit an election, give final approval, publish the result.
// The society's faculty advisor: approve candidates and the office holders' plans and event reports.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const head = ["STUDENT_AFFAIRS", "CHAIRMAN"].includes(user.role);
  try {
    if (b.action === "save") {
      if (!head) return NextResponse.json({ error: "Only the Societies Head opens elections." }, { status: 403 });
      const chairmanId = await chairmanIdFor(user);
      const soc = await prisma.studentSociety.findFirst({ where: { id: String(b.societyId || ""), chairmanId } });
      if (!soc) return NextResponse.json({ error: "Choose a society." }, { status: 400 });
      const dt = (k: string) => { const v = String(b[k] || ""); const d = new Date(v.length === 10 ? `${v}T00:00:00` : v); return Number.isFinite(d.getTime()) ? d : null; };
      const [af, at, vf, vt] = [dt("applyFrom"), dt("applyTo"), dt("voteFrom"), dt("voteTo")];
      if (!af || !at || !vf || !vt || !(af < at && at <= vf && vf < vt)) return NextResponse.json({ error: "Dates must run: applications open → close → voting opens → closes." }, { status: 400 });
      const positions = String(b.positions || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
      if (!positions.length) return NextResponse.json({ error: "List the positions, e.g. President, Vice President, General Secretary." }, { status: 400 });
      const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
      const id = await saveElection(chairmanId, { id: b.id ? String(b.id) : undefined, societyId: soc.id, title: String(b.title || `${soc.name} elections`).slice(0, 160), positions, voterScope: SCOPES[b.voterScope] ? b.voterScope : "SOCIETY", term: /^\d{4}-\d{2}$/.test(String(b.term)) ? String(b.term) : String(new Date().getFullYear()) + "-" + String((new Date().getFullYear() + 1) % 100).padStart(2, "0"), applyFrom: af, applyTo: at, voteFrom: vf, voteTo: vt, minCgpa: num(b.minCgpa), minSemester: num(b.minSemester) }, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "ELECTION_SAVED", entityType: "SocietyElection", entityId: id });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "candidate") { await decideCandidate(String(b.id || ""), b.stage === "HEAD" ? "HEAD" : "ADVISOR", !!b.approve, b.note ? String(b.note).slice(0, 500) : null, user); return NextResponse.json({ ok: true }); }
    if (b.action === "publish") { await publish(String(b.id || ""), user); await writeAuditLog({ actorUserId: user.id, action: "ELECTION_PUBLISHED", entityType: "SocietyElection", entityId: String(b.id) }); return NextResponse.json({ ok: true }); }
    if (b.action === "plan") { await decidePlan(String(b.id || ""), !!b.approve, b.note ? String(b.note).slice(0, 500) : null, user); return NextResponse.json({ ok: true }); }
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? ELECTION_HINT : m }, { status: 400 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
