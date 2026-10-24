import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm } from "../../../components/fyp/FypClient";
import { schemes, sample, CODES_HINT } from "../../../lib/courseCodes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course codes" };

const TERM_OPTS: [string, string][] = [["", "—"], ["Spring", "Spring"], ["Fall", "Fall"], ["Summer", "Summer"]];

export default async function DeanCourseCodes() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN"].includes(user.role)) redirect("/home");
  const cid = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  const depts = await prisma.department.findMany({ where: { chairmanId: cid, ...(user.role === "DEAN" && (user as { facultyId?: string | null }).facultyId ? { facultyId: (user as { facultyId?: string | null }).facultyId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const all = await schemes(cid);
  const fields = [
    { name: "prefix", label: "Prefix (2 letters)", width: 90 }, { name: "digits", label: "Digits", type: "select" as const, options: [["4", "4 (e.g. CS-1001)"], ["3", "3 (e.g. CS101)"]] as [string, string][] },
    { name: "separator", label: "Between", type: "select" as const, options: [["-", "hyphen  CS-1001"], ["", "nothing  CS1001"], [" ", "space  CS 1001"]] as [string, string][] },
    { name: "program", label: "Only for program (optional)" }, { name: "effectiveTerm", label: "From term", type: "select" as const, options: TERM_OPTS }, { name: "effectiveYear", label: "From year", type: "number" as const },
  ];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course-code system</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0, maxWidth: "80ch" }}>Each department codes its own courses: a <b>2-letter prefix</b> and <b>3 or 4 digits</b>. The <b>first digit is the year of study</b> (semesters 1–2 are year 1, 3–4 year 2 …), so codes follow the semesters the Program Leads have set. A course is coded by its <b>home department</b> — Calculus by Mathematics, in every program — and keeps the <b>same code everywhere</b>. A program can have its own prefix. The system applies to batches starting from the term you give; earlier batches keep their codes. Program Leads see the proposed codes under <b>Course Codes</b> and apply them.</p>
      {all === null ? <div className="err">{CODES_HINT}</div> : depts.map((d) => {
        const mine = all.filter((s) => s.departmentId === d.id);
        return (
          <div key={d.id} className="card">
            <h3 style={{ marginTop: 0 }}>{d.name}</h3>
            {mine.map((s) => (
              <div key={s.id} style={{ borderLeft: "4px solid #1565C0", paddingLeft: 10, marginBottom: 8 }}>
                <b style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 15 }}>{sample(s, 1, 1)}, {sample(s, 1, 2)} … {sample(s, 4, 1)}</b>
                <span className="small-note"> · {s.program ? `for ${s.program}` : "all programs"}{s.effectiveYear ? ` · from ${s.effectiveTerm || ""} ${s.effectiveYear}` : " · from now"}</span>
                <ActionForm url="/api/course-codes" fixed={{ action: "scheme", id: s.id, departmentId: d.id }} fields={fields} initial={{ prefix: s.prefix, digits: String(s.digits), separator: s.separator, program: s.program || "", effectiveTerm: s.effectiveTerm || "", effectiveYear: s.effectiveYear || "" }} submit="Save" collapsed openLabel="Change" />
              </div>
            ))}
            <ActionForm url="/api/course-codes" fixed={{ action: "scheme", departmentId: d.id }} fields={fields} initial={{ prefix: d.name.split(/\s+/).filter((w) => !/^(of|and|the|&)$/i.test(w)).map((w) => w[0]).join("").toUpperCase().slice(0, 2), digits: "4", separator: "-", program: "", effectiveTerm: "Fall", effectiveYear: new Date().getFullYear() + 1 }} submit="Set the system" collapsed={mine.length > 0} openLabel={mine.length ? "+ A system for one program" : "Set this department's system"} />
          </div>
        );
      })}
    </Shell>
  );
}
