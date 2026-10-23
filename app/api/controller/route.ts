import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { controllerChairman, publishResults, unpublish, decideRecheck, saveDebarList, setDebarStatus, standingList, CONTROLLER_HINT } from "../../../lib/examController";

const q = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

// GET ?standing=<batchId> — the standing list as CSV.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const cid = user ? await controllerChairman(user) : null;
  if (!user || !cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = req.nextUrl.searchParams.get("standing");
  if (!b) return NextResponse.json({ error: "batch?" }, { status: 400 });
  const rows = await standingList(cid, b);
  const csv = [["Position", "Roll number", "Name", "CGPA", "Standing"].map(q).join(","), ...rows.map((r) => [r.position ?? "", r.rollNumber, r.name, r.cgpa?.toFixed(2) ?? "", r.standing].map(q).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="standing-list.csv"' } });
}

// POST { action: publish | unpublish | recheck | debar-save | debar-status, ... } — Controller of Examinations only.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const cid = user ? await controllerChairman(user) : null;
  if (!user || !cid) return NextResponse.json({ error: "Only the Controller of Examinations (or the Institute Head) can do this." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "publish") {
      const ids: string[] = Array.isArray(b.courseIds) ? b.courseIds : String(b.courseIds || "").split(",").filter(Boolean);
      const n = await publishResults(cid, user, ids, Math.max(0, Math.min(60, Number(b.recheckDays ?? 7))));
      return NextResponse.json({ ok: true, message: `${n} result(s) published; students were told.` });
    }
    if (b.action === "unpublish") { await unpublish(cid, user.id, String(b.courseId)); return NextResponse.json({ ok: true, message: "Withdrawn." }); }
    if (b.action === "recheck") {
      const s = String(b.status); if (!["UPHELD", "CHANGED", "REJECTED"].includes(s)) throw new Error("Choose a decision.");
      await decideRecheck(cid, user.id, String(b.id), s as "UPHELD", String(b.note || ""));
      return NextResponse.json({ ok: true, message: "Decided; the student was told." });
    }
    if (b.action === "debar-save") { const n = await saveDebarList(cid, user.id, String(b.sessionId)); return NextResponse.json({ ok: true, message: `${n} new entr${n === 1 ? "y" : "ies"} issued.` }); }
    if (b.action === "debar-status") { await setDebarStatus(String(b.sessionId), user.id, String(b.id), b.status === "CONDONED" ? "CONDONED" : "DEBARRED", String(b.note || "")); return NextResponse.json({ ok: true, message: "Saved." }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? CONTROLLER_HINT : m }, { status: 400 });
  }
}
