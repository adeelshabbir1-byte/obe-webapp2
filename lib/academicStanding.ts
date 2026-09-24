import { prisma } from "./db";

export type AcademicStanding = "GOOD_STANDING" | "WARNING" | "PROBATION";

// Same math as the Degree Planner's own CGPA — real transcript records
// only, never hypothetical grades (those are sandbox-only, they should
// never affect a real academic-standing determination).
export async function computeCgpa(studentId: string): Promise<number | null> {
  const records = await prisma.studentTranscriptRecord.findMany({ where: { studentId } });
  let totalPoints = 0, totalCredits = 0;
  for (const r of records) {
    if (r.gpaPoints === null) continue;
    totalPoints += r.gpaPoints * r.creditHours;
    totalCredits += r.creditHours;
  }
  return totalCredits > 0 ? totalPoints / totalCredits : null;
}

// A student with no completed courses yet (null CGPA) is always in
// good standing — there's nothing to flag them on.
export function standingFromCgpa(cgpa: number | null): AcademicStanding {
  if (cgpa === null) return "GOOD_STANDING";
  if (cgpa < 2.0) return "PROBATION";
  if (cgpa < 2.5) return "WARNING";
  return "GOOD_STANDING";
}

// Whether a register/withdraw action needs an Advisor's sign-off before
// applying, and why:
//   - ACADEMIC_STANDING: the student is on Warning or Probation — ANY
//     registration change is gated, regardless of the course itself.
//   - MODIFIED_PLAN: the course isn't at the student's own current
//     semester, i.e. this deviates from the standard, on-track batch
//     curriculum.
//   - null: a standard, on-track action for a student in good standing
//     — auto-approved, no request needed at all.
export async function needsAdvisorApproval(
  studentId: string,
  course: { semesterNumber: number | null }
): Promise<"ACADEMIC_STANDING" | "MODIFIED_PLAN" | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return null;

  const cgpa = await computeCgpa(studentId);
  const standing = standingFromCgpa(cgpa);
  if (standing !== "GOOD_STANDING") return "ACADEMIC_STANDING";

  if (course.semesterNumber !== null && course.semesterNumber !== student.currentSemesterNumber) return "MODIFIED_PLAN";

  return null;
}
