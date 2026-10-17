import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { EMPTY_CV, type CvData } from "../../../../lib/studentCv";

const clip = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v: unknown, n = 30) => (Array.isArray(v) ? v.slice(0, n) : []);

// POST { data, showCgpa, published?, submit? } — the student saves their CV (editing sends it back to draft), submits it for review, or publishes an approved CV.
export async function POST(req: Request) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const d = (b.data || {}) as Partial<CvData>;
  const data: CvData = {
    ...EMPTY_CV,
    headline: clip(d.headline, 120), summary: clip(d.summary, 1200), phone: clip(d.phone, 40), email: clip(d.email, 120), city: clip(d.city, 80),
    linkedin: clip(d.linkedin, 200), github: clip(d.github, 200), portfolio: clip(d.portfolio, 200),
    skills: list(d.skills, 40).map((x) => clip(x, 60)).filter(Boolean), languages: list(d.languages, 10).map((x) => clip(x, 40)).filter(Boolean),
    projects: list(d.projects, 10).map((p: any) => ({ title: clip(p?.title, 120), text: clip(p?.text, 600), link: clip(p?.link, 200) })).filter((p) => p.title),
    experience: list(d.experience, 10).map((p: any) => ({ role: clip(p?.role, 100), org: clip(p?.org, 100), from: clip(p?.from, 20), to: clip(p?.to, 20), text: clip(p?.text, 600) })).filter((p) => p.role || p.org),
    certifications: list(d.certifications, 15).map((p: any) => ({ name: clip(p?.name, 120), by: clip(p?.by, 100), year: clip(p?.year, 10) })).filter((p) => p.name),
    achievements: list(d.achievements, 15).map((x) => clip(x, 200)).filter(Boolean),
  };
  const cdb = prisma as unknown as Record<string, any>;
  try {
    const old = await cdb.studentCv.findUnique({ where: { studentId: student.id } });
    const status = b.submit ? "SUBMITTED" : old?.status === "APPROVED" && old.dataJson === JSON.stringify(data) ? "APPROVED" : old?.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
    const published = status === "APPROVED" ? !!b.published : false;
    await cdb.studentCv.upsert({ where: { studentId: student.id }, create: { studentId: student.id, dataJson: JSON.stringify(data), showCgpa: !!b.showCgpa, status, published }, update: { dataJson: JSON.stringify(data), showCgpa: !!b.showCgpa, status, published } });
    return NextResponse.json({ ok: true, status, published });
  } catch { return NextResponse.json({ error: "CVs are not set up yet (migration_fyp_plus.sql)." }, { status: 500 }); }
}
