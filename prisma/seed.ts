import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { HEC_BSCS_2025, HEC_BSCS_2025_PLOS, HEC_BSCS_2025_COURSES } from "./hec-bscs-2025";

const prisma = new PrismaClient();

async function seedSuperUser() {
  const existing = await prisma.user.findUnique({ where: { username: "superadmin" } });
  if (existing) {
    console.log("Super User already exists — skipping.");
    return;
  }

  const passwordHash = await argon2.hash("ChangeMe123!", { type: argon2.argon2id });

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

async function main() {
  await seedSuperUser();
  await seedHecMasterCurriculum();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
