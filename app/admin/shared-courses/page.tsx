import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionButton } from "../../../components/fyp/FypClient";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared Courses — moderation" };

// The Shared Courses Moderator screens what teachers share (spam, copyright, quality) before the national teams review it.
export default async function SharedModeration({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "SHARED_MODERATOR"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);
  const down = searchParams.show === "down";
  const rows = await prisma.publicCourse.findMany({ where: { status: down ? "WITHDRAWN" : "PUBLIC" }, orderBy: { updatedAt: "desc" }, take: 150, select: { id: true, code: true, title: true, version: true, updatedAt: true, importCount: true, reviewComment: true, author: { select: { name: true, instituteName: true, managedBy: { select: { instituteName: true } } } } } });
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : "Platform Team"} userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Shared Courses — moderation</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Newest first. Take down anything that is spam, copied without permission, or empty; the author is told why. <a href={down ? "/admin/shared-courses" : "/admin/shared-courses?show=down"}>{down ? "Show live courses" : "Show taken-down courses"}</a></p>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="small-note">Nothing here.</p> : <table style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th>Course</th><th>Author</th><th>Updated</th><th>Imports</th><th /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><b>{r.code}</b> {r.title} <span className="small-note">v{r.version}</span>{down && r.reviewComment && <div className="small-note" style={{ margin: 0 }}>{r.reviewComment}</div>}</td>
            <td>{r.author?.name}<div className="small-note" style={{ margin: 0 }}>{r.author?.managedBy?.instituteName || r.author?.instituteName || ""}</div></td><td>{r.updatedAt.toISOString().slice(0, 10)}</td><td>{r.importCount}</td>
            <td>{down ? <ActionButton showMessage url="/api/admin/shared-courses" body={{ id: r.id, action: "restore" }} label="Restore" className="btn btn-sm" />
              : <ActionButton showMessage url="/api/admin/shared-courses" body={{ id: r.id, action: "hide" }} label="Take down" className="btn btn-secondary btn-sm" askNote="Why is it taken down? (the author sees this)" noteRequired />}</td></tr>)}</tbody></table>}
      </div>
    </Shell>
  );
}
