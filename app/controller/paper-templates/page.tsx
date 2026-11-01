import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PaperTemplateEditor from "../../../components/PaperTemplateEditor";
import { controllerAccess } from "../../../lib/examController";
import { templatesOf } from "../../../lib/paperTemplates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paper templates" };

// The Controller's paper templates: the institute's, with department / program variants and per exam type.
export default async function PaperTemplatesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await controllerAccess(user);
  if (!acc) redirect("/home");
  const [rows, departments, batches] = await Promise.all([
    templatesOf(acc.chairmanId),
    prisma.department.findMany({ where: { chairmanId: acc.chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.batch.findMany({ where: { coordinator: { managedById: acc.chairmanId } }, select: { degreeProgram: true }, distinct: ["degreeProgram"] }),
  ]);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p><Link href="/controller">← Controller of Examinations</Link></p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Paper templates</h1>
      <p className="small-note" style={{ maxWidth: 900 }}>The layout of every quiz, mid and final paper. The institute&apos;s template applies unless a department or program has its own (and an exam type&apos;s own before &quot;every exam&quot;). The chosen fields are filled for each course automatically; teachers change questions and paper-level text (logged), not the template.</p>
      <PaperTemplateEditor rows={rows as never} departments={departments} programs={batches.map((b) => b.degreeProgram).filter(Boolean).sort()} readOnly={acc.mode === "VIEW"} />
    </Shell>
  );
}
