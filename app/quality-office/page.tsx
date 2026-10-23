import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import { ActionForm } from "../../components/fyp/FypClient";
import { canEditQa, canViewQa, qaInstitute, QKINDS, records, PROFILE_FIELDS, QA_HINT } from "../../lib/qaOffice";
import { formFields } from "../../lib/qaOptions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quality Office" };

export default async function QualityOffice() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!canViewQa(user)) redirect("/home");
  const cid = await qaInstitute(user);
  const edit = canEditQa(user);
  const all = await Promise.all(QKINDS.map((k) => records(cid, k.key)));
  if (all.some((x) => x === null)) return <QualityShell user={user} title="Quality Office" intro=""><div className="err">{QA_HINT}</div></QualityShell>;
  const profile = (await records(cid, "QA_PROFILE"))?.[0] || null;
  const team = await prisma.user.findMany({ where: { isActive: true, OR: [{ extraRoles: { has: "QEC_INCHARGE" } }, { extraRoles: { has: "QEC_MEMBER" } }], AND: [{ OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }] }, select: { name: true, extraRoles: true } });
  const t = new Date().toISOString().slice(0, 10);
  const { form } = await formFields(user, cid, PROFILE_FIELDS);
  return (
    <QualityShell user={user} title={profile?.data.name || "Quality Office (QEC / Directorate of Quality Assurance)"} intro="Everything the quality office keeps, in one place. Program-level OBE work stays with the programs; this is the institute's quality assurance.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {QKINDS.map((k, i) => {
          const rs = all[i]!; const due = k.dueKey ? rs.filter((r) => r.data[k.dueKey!] && r.data[k.dueKey!] < t && !["Replied", "Closed", "Registered", "Affiliated", "Withdrawn"].includes(r.data.status)).length : 0;
          return <Link key={k.key} href={`/quality-office/${k.key.toLowerCase()}`} className="card" style={{ margin: 0, textDecoration: "none", borderTop: `4px solid ${due ? "#C62828" : "#1565C0"}` }}>
            <b style={{ color: "#0D2A4A" }}>{k.short}</b><div style={{ fontSize: 24, fontWeight: 800 }}>{rs.length}</div>{due > 0 && <div style={{ color: "#C62828", fontSize: 12, fontWeight: 700 }}>{due} overdue</div>}</Link>;
        })}
        <Link href="/ipe" className="card" style={{ margin: 0, textDecoration: "none", borderTop: "4px solid #7A2E3B" }}><b>IPE self-assessment</b><div className="small-note">11 HEC standards, evidence, team, action plan</div></Link>
        <Link href="/program-spec" className="card" style={{ margin: 0, textDecoration: "none", borderTop: "4px solid #7A2E3B" }}><b>Program specifications</b><div className="small-note">Generated per program, printable</div></Link>
        <Link href="/quality-office/report" className="card" style={{ margin: 0, textDecoration: "none", borderTop: "4px solid #7A2E3B" }}><b>Annual QA report</b><div className="small-note">From all the registers</div></Link>
        <Link href="/qaa" className="card" style={{ margin: 0, textDecoration: "none", borderTop: "4px solid #7A2E3B" }}><b>QAA / program self-assessment</b><div className="small-note">Existing cycles</div></Link>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>The office</h3>
        <p style={{ fontSize: 13 }}><b>Team:</b> {team.length ? team.map((u) => `${u.name}${u.extraRoles?.includes("QEC_INCHARGE") ? " (Convener)" : ""}`).join(", ") : "No QEC Convener or members named yet — add them on the organisation chart."}</p>
        {profile && !edit && <div style={{ fontSize: 13 }}>{PROFILE_FIELDS.map((f) => profile.data[f.key] ? <p key={f.key}><b>{f.label}:</b> {profile.data[f.key]}</p> : null)}</div>}
        {edit && <ActionForm url="/api/qa-office" fixed={{ action: "save", kind: "QA_PROFILE", ...(profile ? { id: profile.id } : {}) }} fields={form} initial={profile?.data || { name: "Quality Enhancement Cell" }} submit="Save" collapsed={!!profile} openLabel="Edit vision, mission, functions and IPE team" />}
      </div>
    </QualityShell>
  );
}
