import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";

const NAV = [
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Curriculum Migration" },
];

export default async function PloMatrixPage({ params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") redirect("/login");

  const curriculum = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: {
      plos: { orderBy: { number: "asc" } },
      courses: {
        orderBy: [{ category: "asc" }, { domain: "asc" }, { title: "asc" }],
        include: { seedClos: { include: { mappedPlo: true } } },
      },
    },
  });
  if (!curriculum) notFound();

  // For each course × PLO number, determine the cell state: 'hec' if
  // any CLO mapping to that PLO is HEC-sourced, 'system' if only
  // system-suggested ones map there, or empty.
  type CellState = "hec" | "system" | null;
  const matrix: Record<string, Record<number, CellState>> = {};
  for (const course of curriculum.courses) {
    matrix[course.id] = {};
    for (const clo of course.seedClos) {
      if (!clo.mappedPlo) continue;
      const num = clo.mappedPlo.number;
      const current = matrix[course.id][num];
      if (clo.ploMappingSource === "HEC") matrix[course.id][num] = "hec";
      else if (current !== "hec") matrix[course.id][num] = "system";
    }
  }

  const cellStyle = (state: CellState) => ({
    textAlign: "center" as const, fontSize: 11, padding: "4px 2px", border: "1px solid var(--line)",
    background: state === "hec" ? "#F5E27A" : state === "system" ? "#CFE3F5" : "#fff",
  });

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Course – PLO Matrix</h1>
        <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
          {curriculum.authority} {curriculum.title} ({curriculum.version})
        </div>
        <a href={`/admin/curricula/${curriculum.id}`} style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Back to curriculum</a>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 11.5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 14, background: "#F5E27A", border: "1px solid var(--line)", display: "inline-block" }} />
          HEC-sourced — the official document itself specifies this mapping
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 14, background: "#CFE3F5", border: "1px solid var(--line)", display: "inline-block" }} />
          System suggestion — inferred from the CLO's wording, not yet human-verified
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", border: "1px solid var(--line)", background: "#4A4A6A", color: "#fff", position: "sticky", left: 0, zIndex: 1 }}>Course</th>
              {curriculum.plos.map((p) => (
                <th key={p.id} title={p.title} style={{ padding: "4px 4px", border: "1px solid var(--line)", background: "#4A4A6A", color: "#fff", minWidth: 30 }}>
                  PLO{p.number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {curriculum.courses.map((c) => (
              <tr key={c.id}>
                <td style={{ padding: "4px 8px", border: "1px solid var(--line)", background: "#fff", position: "sticky", left: 0, whiteSpace: "nowrap" }}>
                  {c.title} <span style={{ color: "var(--slate)" }}>({c.category === "Major" ? "Core" : c.category === "Domain Elective" ? c.domain || "Elective" : "GE/Other"})</span>
                </td>
                {curriculum.plos.map((p) => (
                  <td key={p.id} style={cellStyle(matrix[c.id]?.[p.number] ?? null)}>
                    {matrix[c.id]?.[p.number] ? "●" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
