import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { suggestionsFor } from "../../../lib/transferMatch";
import { AcceptStrong, Line } from "./TransferForms";

export const dynamic = "force-dynamic";

// Transfer case: suggested equivalences per course (Adeel prompt §33). The Program Lead decides; then the advisor builds
// the degree plan with "Suggest plan" (accepted courses show as TR / EX).
export default async function TransferPage({ params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const r = await (prisma as unknown as Record<string, any>).studentStatusRequest?.findUnique({ where: { id: params.requestId } }).catch(() => null);
  if (!r) redirect("/status-changes");
  const st = await prisma.student.findUnique({ where: { id: r.studentId }, select: { id: true, name: true, rollNumber: true } });
  const { rows } = await suggestionsFor(params.requestId);
  const tone: Record<string, string> = { "Strong (same code)": "#1B6B3A", "Strong (same HEC course)": "#1B6B3A", Likely: "#7A520C", Weak: "#B3261E" };
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Transfer: {st?.rollNumber} {st?.name}</h1>
      <p className="small-note">Each incoming course with the best match in the program: the same code or the same HEC catalog course is a strong match; otherwise by title and credit hours. The Program Lead decides. TR = transferred (credits count); EX = exempted (no credits). The grade and maximum-% rules apply to every acceptance. <Link href="/status-changes">Back to status changes</Link></p>
      <div className="card" style={{ marginBottom: 10 }}><AcceptStrong requestId={params.requestId} /></div>
      <div className="card"><table className="table" style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th style={{ textAlign: "left" }}>Incoming course</th><th>CH</th><th>Grade</th><th style={{ textAlign: "left" }}>Suggested match</th><th>Decision</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.creditId}><td>{x.fromCode} {x.fromTitle}</td><td>{x.ch}</td><td>{x.grade || "—"}</td><td>{x.best ? <><b>{x.best.code}</b> {x.best.title} <span style={{ color: tone[x.best.label] }}>· {x.best.label}</span></> : <span className="small-note">no match</span>}</td><td>{x.status === "PENDING" ? <Line creditId={x.creditId} code={x.best?.code || ""} /> : `${x.status.toLowerCase()}${x.toCode ? ` → ${x.toCode}` : ""}`}</td></tr>)}</tbody></table></div>
      <p className="small-note">Then: the advisor opens the student → Degree plan → Suggest plan (gap courses are placed with junior batches), adjusts it, and the Program Lead confirms the placement.</p>
    </Shell>
  );
}
