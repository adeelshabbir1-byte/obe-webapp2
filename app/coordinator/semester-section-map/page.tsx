import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseTypeColor } from "../../../lib/courseTypeColors";
import { coordinatorIdsFor, chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";

type Row = {
  key: string; kind: "course" | "group"; label: string; code: string | null; courseType: string;
  batchLabel: string; combinedWith: string[];
  sections: { label: string; instructorName: string }[];
};

// Turns "Dr. Khan: 2 sections" + "Ms. Ali: 1 section" into individually
// labeled rows (Section A/B/C, …) — the Assigner Matrix only stores a
// per-instructor count, not individual section rows, so this is where
// that count actually gets expanded into something a viewer can read as
// "who's teaching which section."
function expandSections(assignments: { instructor: { name: string }; sectionCount: number }[]): { label: string; instructorName: string }[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out: { label: string; instructorName: string }[] = [];
  let i = 0;
  for (const a of assignments) {
    for (let n = 0; n < a.sectionCount; n++) {
      out.push({ label: `Section ${letters[i] ?? i + 1}`, instructorName: a.instructor.name });
      i++;
    }
  }
  return out;
}

export default async function SemesterSectionMapPage({ searchParams }: { searchParams: { semester?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "OMC", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");

  const parsedSemester = parseInt(searchParams.semester || "1", 10);
  const selectedSemester = Number.isFinite(parsedSemester) && parsedSemester >= 1 ? parsedSemester : 1;

  const coordinatorIds = await coordinatorIdsFor(user);
  const chairmanId = await chairmanIdFor(user);

  const courses = coordinatorIds.length > 0
    ? await prisma.course.findMany({
        where: { coordinatorId: { in: coordinatorIds }, isOffered: true, semesterNumber: selectedSemester },
        include: { batch: true, sectionAssignments: { include: { instructor: true } }, equivalenceMember: true },
        orderBy: [{ batch: { degreeProgram: "asc" } }, { code: "asc" }],
      })
    : [];
  const standaloneCourses = courses.filter((c) => !c.equivalenceMember);

  // Every clubbed class (CourseEquivalenceGroup) that has at least one
  // member running at this semester, within this institution — scoped by
  // chairmanId the same way Course Equivalence itself is scoped elsewhere.
  const groups = chairmanId
    ? await prisma.courseEquivalenceGroup.findMany({
        where: { chairmanId, members: { some: { course: { isOffered: true, semesterNumber: selectedSemester, coordinatorId: { in: coordinatorIds } } } } },
        include: {
          members: { include: { course: { include: { batch: true } } } },
          sectionAssignments: { include: { instructor: true } },
        },
      })
    : [];

  const rows: Row[] = [];

  for (const c of standaloneCourses) {
    rows.push({
      key: c.id, kind: "course",
      label: c.title, code: c.code, courseType: c.courseType,
      batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
      combinedWith: [],
      sections: expandSections(c.sectionAssignments),
    });
  }

  // Clubbed classes repeat once per member batch at this semester (rather
  // than once overall), so the class is visible no matter which batch
  // someone is scanning this map for — each repeat still names every
  // OTHER batch it's combined with, so nothing about the clubbing is lost.
  for (const g of groups) {
    const membersHere = g.members.filter((m) => m.course.isOffered && m.course.semesterNumber === selectedSemester && coordinatorIds.includes(m.course.coordinatorId));
    const allBatchLabels = membersHere.map((m) => m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "—");
    const sections = expandSections(g.sectionAssignments);
    for (const m of membersHere) {
      const thisBatchLabel = m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "—";
      rows.push({
        key: `${g.id}-${m.courseId}`, kind: "group",
        label: g.name, code: m.course.code, courseType: "Combined",
        batchLabel: thisBatchLabel,
        combinedWith: allBatchLabels.filter((b) => b !== thisBatchLabel),
        sections,
      });
    }
  }

  rows.sort((a, b) => a.batchLabel.localeCompare(b.batchLabel) || a.label.localeCompare(b.label));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Semester Section Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Pick a semester number to see every section currently running in it, across every program at once —
        each instructor's own section, and clubbed/combined classes (shared across multiple batches) shown
        once per batch they draw from, labeled "Combined" with the other batches named alongside it.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Semester</label>
            <select name="semester" defaultValue={String(selectedSemester)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show</button>
        </form>
      </div>

      {rows.length === 0 && (
        <div className="card"><p style={{ fontSize: 12.5, color: "var(--slate)" }}>No offered sections found for Semester {selectedSemester}.</p></div>
      )}

      <div className="card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ minWidth: 220, maxWidth: 260, border: "1px solid var(--line)", borderLeft: `4px solid ${courseTypeColor(r.courseType, r.code || undefined)}`, padding: "8px 10px", borderRadius: 3 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.code ? `${r.code} — ${r.label}` : r.label}</div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>{r.batchLabel}</div>
              {r.kind === "group" && r.combinedWith.length > 0 && (
                <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>Combined with: {r.combinedWith.join(", ")}</div>
              )}
              <div style={{ marginTop: 6 }}>
                {r.sections.length === 0 && <div style={{ fontSize: 11, color: "var(--rust)" }}>No sections assigned yet</div>}
                {r.sections.map((s, i) => (
                  <div key={i} style={{ fontSize: 11, marginTop: 2 }}>{s.label}: {s.instructorName}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
