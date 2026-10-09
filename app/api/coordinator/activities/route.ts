import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { ACTIVITY_CATEGORIES } from "../../../../lib/resources";

const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// The Program Lead's log of extra-curricular activities for their own program.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = str(b.title, 200);
  if (!title) return NextResponse.json({ error: "give the activity a title" }, { status: 400 });
  if (!ACTIVITY_CATEGORIES.includes(b.category)) return NextResponse.json({ error: "choose a category" }, { status: 400 });
  const when = new Date(String(b.activityDate || ""));
  if (isNaN(when.getTime())) return NextResponse.json({ error: "choose the date" }, { status: 400 });
  if (b.photo && (typeof b.photo !== "string" || !b.photo.startsWith("data:image/") || b.photo.length > 400_000)) return NextResponse.json({ error: "the picture is too large - choose a smaller one" }, { status: 400 });
  let batchId: string | null = null;
  if (b.batchId) {
    const batch = await prisma.batch.findFirst({ where: { id: String(b.batchId), coordinatorId: user.id } });
    if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 400 });
    batchId = batch.id;
  }
  const participants = b.participants === "" || b.participants == null ? null : Math.max(0, parseInt(String(b.participants), 10) || 0);
  const data = { title, category: b.category as string, activityDate: when, organizer: str(b.organizer, 160), venue: str(b.venue, 160), participants, description: str(b.description, 3000), outcome: str(b.outcome, 2000), batchId, ...(b.photo !== undefined ? { photo: b.photo || null } : {}) };
  if (b.id) {
    const mine = await prisma.activityLog.findFirst({ where: { id: String(b.id), coordinatorId: user.id } });
    if (!mine) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.activityLog.update({ where: { id: mine.id }, data });
  } else {
    await prisma.activityLog.create({ data: { coordinatorId: user.id, ...data } });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const r = await prisma.activityLog.deleteMany({ where: { id, coordinatorId: user.id } });
  return NextResponse.json({ ok: r.count > 0 });
}
