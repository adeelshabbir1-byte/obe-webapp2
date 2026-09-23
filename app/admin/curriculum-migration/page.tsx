import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import AutoSubmitSelect from "../../../components/AutoSubmitSelect";

const NAV = [
  { href: "/admin/users", label: "Chairman Accounts" },
  { href: "/admin/account-requests", label: "Account Requests" },
  { href: "/admin/curricula", label: "Master Curricula" },
  { href: "/admin/curriculum-migration", label: "Version Migration" },
  { href: "/admin/platform-settings", label: "Platform Settings" },
  { href: "/admin/report-bundles", label: "Report Bundles" },
  { href: "/admin/landing-page", label: "Landing Page" },
];

export default async function CurriculumMigrationPage({ searchParams }: { searchParams: { fromId?: string; toId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  const curricula = await prisma.masterCurriculum.findMany({ orderBy: [{ title: "asc" }, { version: "desc" }] });

  // Group by title so the two dropdowns only offer sensible pairs.
  const byTitle = new Map<string, typeof curricula>();
  for (const c of curricula) byTitle.set(c.title, [...(byTitle.get(c.title) || []), c]);

  const fromId = searchParams.fromId || "";
  const toId = searchParams.toId || "";

  let diff: any = null;
  let affectedBatches: any[] = [];

  if (fromId && toId && fromId !== toId) {
    const [fromCourses, toCourses, fromPlos, toPlos] = await Promise.all([
      prisma.masterCourse.findMany({ where: { masterCurriculumId: fromId } }),
      prisma.masterCourse.findMany({ where: { masterCurriculumId: toId } }),
      prisma.masterPLO.findMany({ where: { masterCurriculumId: fromId } }),
      prisma.masterPLO.findMany({ where: { masterCurriculumId: toId } }),
    ]);

    const toCodesSet = new Set(toCourses.map((c) => c.code));
    const fromCodesSet = new Set(fromCourses.map((c) => c.code));
    const toByCode = new Map(toCourses.map((c) => [c.code, c]));
    const fromByCode = new Map(fromCourses.map((c) => [c.code, c]));

    const addedCourses = toCourses.filter((c) => !fromCodesSet.has(c.code));
    const removedCourses = fromCourses.filter((c) => !toCodesSet.has(c.code));
    const changedCourses = fromCourses.filter((c) => {
      const match = toByCode.get(c.code);
      return match && (match.title !== c.title || match.creditHours !== c.creditHours || match.category !== c.category || match.semesterNumber !== c.semesterNumber);
    }).map((c) => ({ old: c, new: toByCode.get(c.code)! }));

    const toPloNumbers = new Set(toPlos.map((p) => p.number));
    const fromPloNumbers = new Set(fromPlos.map((p) => p.number));
    const addedPlos = toPlos.filter((p) => !fromPloNumbers.has(p.number));
    const removedPlos = fromPlos.filter((p) => !toPloNumbers.has(p.number));

    diff = { addedCourses, removedCourses, changedCourses, addedPlos, removedPlos };

    // Batches whose courses were adopted from the OLDER curriculum.
    const adoptedFromOld = await prisma.course.findMany({
      where: { masterCourseId: { in: fromCourses.map((c) => c.id) } },
      include: { batch: true },
      distinct: ["batchId"],
    });
    affectedBatches = adoptedFromOld.filter((c) => c.batch).map((c) => ({ id: c.batch!.id, label: `${c.batch!.degreeProgram} — ${c.batch!.batchName}` }));
  }

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curriculum Version Migration</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Compare two versions of the same curriculum and see which batches are still on the older one.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>From (older)</label>
            <select name="fromId" defaultValue={fromId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">— Select —</option>
              {curricula.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.version})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>To (newer)</label>
            <select name="toId" defaultValue={toId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">— Select —</option>
              {curricula.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.version})</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Compare</button>
        </form>
      </div>

      {diff && (
        <>
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Course Changes</h3>
            {diff.addedCourses.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <b style={{ fontSize: 12.5, color: "var(--sage)" }}>Added ({diff.addedCourses.length})</b>
                <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12.5 }}>{diff.addedCourses.map((c: any) => <li key={c.id}>{c.code} — {c.title}</li>)}</ul>
              </div>
            )}
            {diff.removedCourses.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <b style={{ fontSize: 12.5, color: "var(--rust)" }}>Removed ({diff.removedCourses.length})</b>
                <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12.5 }}>{diff.removedCourses.map((c: any) => <li key={c.id}>{c.code} — {c.title}</li>)}</ul>
              </div>
            )}
            {diff.changedCourses.length > 0 && (
              <div>
                <b style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>Changed ({diff.changedCourses.length})</b>
                <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 12.5 }}>
                  {diff.changedCourses.map((c: any) => <li key={c.old.id}>{c.old.code}: {c.old.title} → {c.new.title}, {c.old.creditHours}cr → {c.new.creditHours}cr</li>)}
                </ul>
              </div>
            )}
            {diff.addedCourses.length === 0 && diff.removedCourses.length === 0 && diff.changedCourses.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No course differences.</p>}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>PLO Changes</h3>
            {diff.addedPlos.length > 0 && <p style={{ fontSize: 12.5, color: "var(--sage)" }}>Added: {diff.addedPlos.map((p: any) => `PLO-${p.number}`).join(", ")}</p>}
            {diff.removedPlos.length > 0 && <p style={{ fontSize: 12.5, color: "var(--rust)" }}>Removed: {diff.removedPlos.map((p: any) => `PLO-${p.number}`).join(", ")}</p>}
            {diff.addedPlos.length === 0 && diff.removedPlos.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No PLO differences.</p>}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Batches Still on the Older Version</h3>
            {affectedBatches.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>None — no batch has adopted courses from the older curriculum.</p>}
            {affectedBatches.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                {affectedBatches.map((b) => <li key={b.id}>{b.label}</li>)}
              </ul>
            )}
            <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
              To move a batch to the newer version, its Coordinator can import the new curriculum into that batch —
              the existing "Copy From Another Batch" and benchmark-inheritance tools carry over CLOs/schedule/weights automatically.
            </p>
          </div>
        </>
      )}
    </Shell>
  );
}
