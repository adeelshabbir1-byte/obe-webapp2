import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth";
import { HEC_BSCS_2025, HEC_BSCS_2025_PLOS, HEC_BSCS_2025_COURSES } from "./hec-bscs-2025";
import { HEC_COURSE_SEED_CONTENT } from "./hec-course-seed-content";

const prisma = new PrismaClient();

async function seedSuperUser() {
  const existing = await prisma.user.findUnique({ where: { username: "superadmin" } });
  if (existing) {
    console.log("Super User already exists — skipping.");
    return;
  }

  const passwordHash = await hashPassword("ChangeMe123!");

  await prisma.user.create({
    data: {
      username: "superadmin",
      email: "superadmin@example.com",
      passwordHash,
      name: "Super Administrator",
      role: "SUPER_USER",
      mustChangePassword: true,
    },
  });

  console.log("Created Super User:");
  console.log("  username: superadmin");
  console.log("  password: ChangeMe123!");
  console.log("  (change this immediately after first login)");
}

async function seedHecMasterCurriculum() {
  const existing = await prisma.masterCurriculum.findFirst({
    where: { authority: HEC_BSCS_2025.authority, title: HEC_BSCS_2025.title, version: HEC_BSCS_2025.version },
  });
  if (existing) {
    console.log("HEC BS Computer Science 2025 Master Curriculum already seeded — skipping.");
    return;
  }

  const curriculum = await prisma.masterCurriculum.create({
    data: {
      authority: HEC_BSCS_2025.authority,
      title: HEC_BSCS_2025.title,
      version: HEC_BSCS_2025.version,
      publicationDate: new Date(HEC_BSCS_2025.publicationDate),
      sourceReference: HEC_BSCS_2025.sourceReference,
      status: "PUBLISHED",
    },
  });

  await prisma.masterPLO.createMany({
    data: HEC_BSCS_2025_PLOS.map((p) => ({
      masterCurriculumId: curriculum.id,
      number: p.number,
      title: p.title,
      description: p.description,
    })),
  });

  await prisma.masterCourse.createMany({
    data: HEC_BSCS_2025_COURSES.map((c) => ({
      masterCurriculumId: curriculum.id,
      code: c.code,
      title: c.title,
      creditHours: c.creditHours,
      category: c.category,
      semesterNumber: c.semesterNumber,
    })),
  });

  console.log(`Seeded HEC BS Computer Science 2025: ${HEC_BSCS_2025_COURSES.length} courses, ${HEC_BSCS_2025_PLOS.length} PLOs.`);
  console.log(`Source: ${HEC_BSCS_2025.sourceReference}, published ${HEC_BSCS_2025.publicationDate}.`);
}

async function seedMasterCourseContent() {
  // Runs independently of whether the curriculum itself is newly seeded —
  // backfills CLOs/topics onto MasterCourse rows that already exist but
  // don't have this content yet (matched by code).
  const courses = await prisma.masterCourse.findMany({ where: { code: { in: Object.keys(HEC_COURSE_SEED_CONTENT) } } });
  let seeded = 0;
  for (const course of courses) {
    const existing = await prisma.masterCourseClo.count({ where: { masterCourseId: course.id } });
    if (existing > 0) continue;
    const seed = HEC_COURSE_SEED_CONTENT[course.code];
    if (!seed) continue;
    await prisma.masterCourseClo.createMany({
      data: seed.clos.map((c, i) => ({ masterCourseId: course.id, statement: c.statement, bloomLevel: c.bloomLevel, orderIndex: i })),
    });
    await prisma.masterCourseTopic.createMany({
      data: seed.topics.map((topic, i) => ({ masterCourseId: course.id, lectureNumber: i + 1, topic })),
    });
    seeded++;
  }
  console.log(`Backfilled CLO/topic seed content onto ${seeded} existing MasterCourse row(s).`);
}

async function main() {
  await seedSuperUser();
  await seedHecMasterCurriculum();
  await seedMasterCourseContent();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
