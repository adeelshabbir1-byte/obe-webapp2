import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CustomCategoriesManager from "../../../components/CustomCategoriesManager";
import { navForRole } from "../../../components/reportNav";


export default async function CustomCategoriesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const chairmanId = user.managedById || "";

  const [categories, allCourses, faculty] = await Promise.all([
    prisma.customCategory.findMany({ where: { chairmanId }, include: { _count: { select: { courses: true, faculty: true } } }, orderBy: { name: "asc" } }),
    prisma.course.findMany({
      where: { coordinatorId: user.id },
      select: { id: true, code: true, title: true, customCategoryId: true, contentSyncMember: { select: { isBase: true } } },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    }),
    prisma.user.findMany({ where: { managedById: user.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } }, select: { id: true, name: true, role: true, customCategoryId: true }, orderBy: { name: "asc" } }),
  ]);

  // Same "base courses only" idea as Assign Subject Experts: a
  // content-sync follower inherits everything from its base, including
  // its category, so it never needs its own picker row — but it still
  // needs the category actually SET on it directly (there's no
  // inherit-at-read-time logic for categories elsewhere in the app), so
  // group ALL courses (base and follower alike) by code for the full
  // set of ids a category application should touch, while only using
  // the base/unlinked ones to decide which codes get shown as rows at
  // all. The same course code often repeats across several
  // batches/cohorts too — one row per unique code covers all of them.
  const groupsByCode = new Map<string, typeof allCourses>();
  for (const c of allCourses) {
    if (!groupsByCode.has(c.code)) groupsByCode.set(c.code, []);
    groupsByCode.get(c.code)!.push(c);
  }
  const codesWithABaseRow = new Set(
    allCourses.filter((c) => !c.contentSyncMember || c.contentSyncMember.isBase).map((c) => c.code)
  );
  // Only the still-uncategorized ones need to show up in the picker at
  // all — this is what actually shrinks the Coordinator's remaining
  // workload as they go, rather than re-showing everything every time.
  // Categorized courses stay in the list too (shown grouped by category, below the uncategorized ones) so they can be reviewed or re-tagged.
  const allCourseGroups = Array.from(groupsByCode.entries())
    .filter(([code]) => codesWithABaseRow.has(code))
    .map(([code, members]) => ({ code, title: members[0].title, courseIds: members.map((m) => m.id), categoryId: members.find((m) => m.customCategoryId)?.customCategoryId ?? null }));

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course & Faculty Categories</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Your own institution-specific classification, separate from HEC's official course type — use it to
        help match courses to the right faculty.
      </p>
      <CustomCategoriesManager
        initialCategories={categories.map((c) => ({ id: c.id, name: c.name, courseCount: c._count.courses, facultyCount: c._count.faculty }))}
        courseGroups={allCourseGroups}
        faculty={faculty}
      />
    </Shell>
  );
}
