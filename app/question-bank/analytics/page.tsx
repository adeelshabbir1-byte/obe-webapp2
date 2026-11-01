import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { bankAnalytics } from "../../../lib/qbankAnalytics";
import { FLAG_LABEL, READY_PER_CLO_BLOOM } from "../../../lib/qbankCore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question bank analytics" };

// For the Program Lead and the OMC: bank coverage per course (approved questions per CLO, Bloom level and difficulty
// against the readiness target), the questions most often flagged, and contributions per teacher.
export default async function BankAnalyticsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["PROGRAM_COORDINATOR", "OMC"].includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const where = user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: chairmanId } };
  const courses = await prisma.course.findMany({ where: { ...where, isOffered: true }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" }, take: 120 });
  const a = await bankAnalytics(chairmanId, courses);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p><Link href="/question-bank">← Question bank</Link></p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Question bank analytics</h1>
      <p className="small-note">Target: {READY_PER_CLO_BLOOM} approved questions per CLO per Bloom level the course uses.</p>
      <div className="card" style={{ overflowX: "auto" }} data-coverage>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Coverage</h3>
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Approved</th><th>Easy / Medium / Hard</th><th>Per CLO and Bloom</th><th>Below target</th></tr></thead>
          <tbody>{a.coverage.map((c) => <tr key={c.code} data-course={c.code}><td>{c.code} {c.title}</td><td>{c.approved}</td><td>{c.easy} / {c.medium} / {c.hard}</td><td>{Object.entries(c.perCloBloom).map(([k, n]) => `${k}: ${n}`).join(" · ") || "—"}</td><td style={{ color: c.short.length ? "#B3261E" : "#1F5E36" }}>{c.short.length ? c.short.map((s) => `${s.clo} ${s.bloom} (${s.have})`).join(", ") : "✓"}</td></tr>)}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }} data-flagged>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Most often flagged</h3>
        <table style={{ fontSize: 12.5 }}><tbody>{a.flagged.map((f) => <tr key={f.id}><td>{f.code}</td><td style={{ maxWidth: 520 }}>{f.text.slice(0, 160)}</td><td>{f.flags.map((x) => FLAG_LABEL[x] || x).join(", ")}</td><td>used {f.used}×</td></tr>)}</tbody></table>
        {!a.flagged.length && <p className="small-note">No flags yet (they come from results after marks are entered).</p>}
      </div>
      <div className="card" style={{ overflowX: "auto" }} data-contrib>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Contributions per teacher</h3>
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Teacher</th><th>Added</th><th>Approved</th></tr></thead><tbody>{a.contributions.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.added}</td><td>{c.approved}</td></tr>)}</tbody></table>
      </div>
    </Shell>
  );
}
