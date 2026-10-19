import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { ALUMNI_HINT, alumniLink, comment, createRequest, decideVoice, makeIndustrySe } from "../../../lib/alumniVoice";
import { writeAuditLog } from "../../../lib/audit";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const DECIDE_SUGGESTION = ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "SUBJECT_EXPERT", "DEAN"];
const DECIDE_WORKSHOP = ["STUDENT_AFFAIRS", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "PROGRAM_COORDINATOR"];

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  const alumnus = async (id: string) => prisma.alumni.findFirst({ where: { id, chairmanId } });
  try {
    if (b.action === "request") {
      const al = await alumnus(str(b.alumniId, 60));
      if (!al) return NextResponse.json({ error: "Choose an alumnus." }, { status: 400 });
      const message = str(b.message, 2000) || `Dear ${al.name}, we would value your help with the ${al.degreeProgram} program. Please take two minutes to answer below.`;
      const questions = str(b.questions, 3000).split("\n").map((q) => q.trim()).filter(Boolean);
      const t = await createRequest(al.id, user.id, message, questions);
      return NextResponse.json({ ok: true, link: `/alumni/r/${t}` });
    }
    if (b.action === "link") {
      if (!["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "STUDENT_AFFAIRS"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const al = await alumnus(str(b.alumniId, 60));
      if (!al) return NextResponse.json({ error: "Choose an alumnus." }, { status: 400 });
      return NextResponse.json({ ok: true, link: `/alumni/me/${await alumniLink(al.id)}` });
    }
    if (b.action === "comment") {
      const text = str(b.text, 2000);
      if (text.length < 2) return NextResponse.json({ error: "Write a comment." }, { status: 400 });
      await comment(str(b.voiceId, 60), user, text);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "decide") {
      const v = await (prisma as unknown as Record<string, any>).alumniVoice.findFirst({ where: { id: str(b.voiceId, 60), chairmanId } });
      if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (!(v.kind === "WORKSHOP" ? DECIDE_WORKSHOP : DECIDE_SUGGESTION).includes(user.role)) return NextResponse.json({ error: "Not yours to decide." }, { status: 403 });
      const status = ["TAKEN_UP", "NOT_NOW", "ACCEPTED", "DECLINED", "DONE"].includes(b.status) ? b.status : "OPEN";
      const when = b.scheduledFor ? new Date(String(b.scheduledFor)) : null;
      await decideVoice(v.id, status, str(b.reply, 1000) || null, when && Number.isFinite(when.getTime()) ? when : null, user.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "industrySe") {
      if (!["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "The Program Lead, HOD or Institute Head does this." }, { status: 403 });
      const al = await alumnus(str(b.alumniId, 60));
      if (!al) return NextResponse.json({ error: "Choose an alumnus." }, { status: 400 });
      const leadId = user.role === "PROGRAM_COORDINATOR" ? user.id : str(b.leadId, 60);
      const r = await makeIndustrySe(al.id, leadId, str(b.email, 160) || al.email || "", user.id);
      await writeAuditLog({ actorUserId: user.id, action: "INDUSTRY_SE_CREATED", entityType: "Alumni", entityId: al.id });
      return NextResponse.json({ ok: true, ...r, message: `Login created — username ${r.username}, temporary password ${r.password}. Give these to ${al.name}; they set their own password on first sign-in.` });
    }
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? ALUMNI_HINT : m }, { status: 400 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
