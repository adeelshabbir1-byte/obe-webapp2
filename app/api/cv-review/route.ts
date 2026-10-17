import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { canReviewCv } from "../../../lib/studentCv";

// POST { studentId, action: "approve" | "changes", note } — the batch's CV reviewer (advisor), the Program Lead or the FYP supervisor.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const studentId = String(b.studentId || "");
  if (!user || !(await canReviewCv(user, studentId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const note = String(b.note || "").trim().slice(0, 1000);
  if (b.action === "changes" && note.length < 3) return NextResponse.json({ error: "Say what should change." }, { status: 400 });
  await (prisma as unknown as Record<string, any>).studentCv.update({ where: { studentId }, data: { status: b.action === "approve" ? "APPROVED" : "CHANGES", reviewerNote: note || null, reviewedById: user.id, ...(b.action === "approve" ? {} : { published: false }) } });
  return NextResponse.json({ ok: true });
}
