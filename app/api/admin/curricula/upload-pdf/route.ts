import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { parseCurriculumText } from "../../../../../lib/curriculumPdfParser";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string) || "";
  const authority = (formData.get("authority") as string) || "Institution";
  const version = (formData.get("version") as string) || new Date().getFullYear().toString();

  if (!file) return NextResponse.json({ error: "a PDF file is required" }, { status: 400 });
  if (!title.trim()) return NextResponse.json({ error: "a program title is required (e.g. \"BS Computer Science\")" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let text = "";
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } catch (err: any) {
    return NextResponse.json({ error: "couldn't read that PDF — make sure it's a valid, non-scanned file" }, { status: 400 });
  }

  const parsedCourses = parseCurriculumText(text);

  const curriculum = await prisma.masterCurriculum.create({
    data: {
      authority, title: title.trim(), version, status: "DRAFT",
      sourceReference: file.name,
    },
  });

  if (parsedCourses.length > 0) {
    await prisma.masterCourse.createMany({
      data: parsedCourses.map((c) => ({
        masterCurriculumId: curriculum.id,
        code: c.code, title: c.title, creditHours: c.creditHours || 3,
        category: c.category || "Core",
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    curriculumId: curriculum.id,
    coursesFound: parsedCourses.length,
    message: parsedCourses.length === 0
      ? "No courses could be auto-detected from this file's format — a blank draft curriculum was created for you to build manually."
      : `Auto-detected ${parsedCourses.length} course(s). Review titles, categories, and credit hours carefully before publishing — this extraction is best-effort.`,
  }, { status: 201 });
}
