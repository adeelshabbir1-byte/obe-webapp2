import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import InstituteSettingsForm from "../../../components/InstituteSettingsForm";
import RecomputeWeightsButton from "../../../components/RecomputeWeightsButton";
import { navForRole } from "../../../components/reportNav";
import { ActionForm } from "../../../components/fyp/FypClient";
import { obeStarts, termLabel } from "../../../lib/obeTerm";

export default async function InstituteSettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });

  const obe = await obeStarts(user.id);
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute&apos;s Profile</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Shown across every page for your institution.</p>
      <InstituteSettingsForm initialName={fullUser?.instituteName || ""} />
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>OBE start term</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Courses taught in this term or later are OBE courses (CLOs, assessments mapped to CLOs, attainment), whichever batch takes them — e.g. a Fall 2023 batch in its 3rd semester in Fall 2024 gets OBE courses from then on. Courses taught earlier are grades only. Transcripts and CGPA are the same either way. A Program Lead can set a different start for their program. Now: <b>{obe.institute ? termLabel(obe.institute) : "not set — every course counts as OBE"}</b>{obe.programs.length ? ` · programs: ${obe.programs.map((p) => `${p.program} from ${termLabel(p)}`).join(", ")}` : ""}.</p>
        <ActionForm url="/api/obe-start" fixed={{ scope: "institute" }} submit="Save OBE start" showMessage initial={{ termName: obe.institute?.termName || "Fall", termYear: obe.institute?.termYear || "" }}
          fields={[{ name: "termName", label: "Term", type: "select", options: [["Fall", "Fall"], ["Spring", "Spring"]] }, { name: "termYear", label: "Year (empty = clear)", type: "number", width: 110 }]} />
      </div>
      <RecomputeWeightsButton />
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Data export</h3>
        <p className="small-note">Download every academic table of your institute (staff, batches, students, courses, GAs, CLOs, assessments, marks, results) as spreadsheets in one ZIP — your own backup. Passwords are never included.</p>
        <a className="btn btn-sm" href="/api/institute-export">Download institute data</a> <a className="act" href="/security" target="_blank" rel="noopener noreferrer">Security &amp; data protection</a>
      </div>
    </Shell>
  );
}
