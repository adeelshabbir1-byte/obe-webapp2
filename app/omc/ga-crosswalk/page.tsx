import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../components/reportNav";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { foreignCourses, crosswalk, linksOf, councilOfProgram } from "../../../lib/gaCrosswalk";
import { COUNCIL_SETS, attrCode } from "../../../lib/councilAttributes";
import { departmentOfProgram, omcCommittee, majority } from "../../../lib/omcCommittee";

// One GA crosswalk per pair of programs (ours ← theirs), seeded from the council sets; our OMC endorses, the
// Convener finalises on a majority. Every edit is kept in the history.
export default async function GaCrosswalkPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const rows = await foreignCourses(chairmanId, leads).catch(() => []);
  const pairs = Array.from(new Set(rows.filter((r) => r.theirProgram).map((r) => `${r.ourProgram}|${r.theirProgram}`)));
  const db = prisma as unknown as Record<string, any>;
  const stored = ((await db.gaCrosswalk.findMany({ where: { chairmanId } }).catch(() => [])) as { ourProgram: string; theirProgram: string }[]);
  for (const s of stored) if (!pairs.includes(`${s.ourProgram}|${s.theirProgram}`)) pairs.push(`${s.ourProgram}|${s.theirProgram}`);
  const cards = await Promise.all(pairs.map(async (p) => {
    const [ours, theirs] = p.split("|");
    const cw = await crosswalk(chairmanId, ours, theirs);
    const [ok, tk] = await Promise.all([councilOfProgram(chairmanId, ours), councilOfProgram(chairmanId, theirs)]);
    const com = await omcCommittee(chairmanId, await departmentOfProgram(chairmanId, ours));
    const en = cw ? ((await db.gaCrosswalkEndorse.findMany({ where: { crosswalkId: cw.id } }).catch(() => [])) as { userId: string; userName: string; endorse: boolean }[]) : [];
    return { ours, theirs, cw, ok, tk, com, en };
  }));
  return (
    <Shell roleLabel={user.role === "OMC" ? "OMC Member" : "Faculty"} userName={user.name} navLinks={user.role === "OMC" ? OMC_ACTION_NAV : navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GA Crosswalk</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>How the home program&apos;s GAs count toward ours, for courses we take from another department. Seeded theme by theme from the council attributes (partial = 50 %); adjust, endorse, and the Convener finalises. CGA-10 is never reached by default from a business course — add it to a course&apos;s GAs by hand if needed.</p>
      {!cards.length && <div className="card"><p className="small-note">No program pairs yet — they appear when a batch takes a course linked to another department&apos;s course.</p></div>}
      {cards.map(({ ours, theirs, cw, ok, tk, com, en }) => {
        if (!cw || !ok || !tk) return <div key={ours + theirs} className="card"><b>{ours} ← {theirs}</b><p className="small-note">Set each program&apos;s council (accreditation body) first.</p></div>;
        const links = linksOf(cw);
        const yes = en.filter((e) => e.endorse && com.all.includes(e.userId)).length;
        return (
          <div key={cw.id} className="card" style={{ borderLeft: `5px solid ${cw.status === "FINAL" ? "#2E7D32" : "#C98A0B"}` }}>
            <b>{ours} ({COUNCIL_SETS[ok].prefix}) ← {theirs} ({COUNCIL_SETS[tk].prefix})</b> <span className="small-note">· {cw.status === "FINAL" ? "finalised" : "draft"} · endorsed {yes} of {com.all.length}{com.all.filter((id) => !en.some((e) => e.userId === id)).length ? ` · waiting: ${com.all.filter((id) => !en.some((e) => e.userId === id)).map((id) => com.names.get(id)).join(", ")}` : ""}</span>
            <table style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Our GA</th><th>Their GA</th><th>Weight</th></tr></thead>
              <tbody>{COUNCIL_SETS[ok].attrs.map((a) => { const ls = links.filter((l) => l.ours === a.n); return <tr key={a.n}><td>{attrCode(ok, a.n)} {a.title}</td><td>{ls.length ? ls.map((l) => `${attrCode(tk, l.their)} ${COUNCIL_SETS[tk].attrs.find((x) => x.n === l.their)?.title || ""}`).join("; ") : <span className="small-note">— none</span>}</td><td>{ls.map((l) => `${Math.round(l.w * 100)} %`).join("; ")}</td></tr>; })}</tbody></table>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <ActionForm url="/api/omc/ga-crosswalk" fixed={{ action: "edit", id: cw.id }} collapsed openLabel="Change a link" submit="Save"
                fields={[{ name: "ours", label: "Our GA", type: "select", options: COUNCIL_SETS[ok].attrs.map((a) => [String(a.n), attrCode(ok, a.n)] as [string, string]) }, { name: "their", label: "Their GA", type: "select", options: COUNCIL_SETS[tk].attrs.map((a) => [String(a.n), attrCode(tk, a.n)] as [string, string]) }, { name: "w", label: "Weight", type: "select", options: [["1", "100 %"], ["0.5", "50 % (partial)"], ["0", "remove"]] }]} />
              {com.all.includes(user.id) && cw.status !== "FINAL" && <ActionButton url="/api/omc/ga-crosswalk" body={{ action: "endorse", id: cw.id, endorse: true }} label="Endorse" className="btn btn-sm" />}
              {com.convenerId === user.id && cw.status !== "FINAL" && <ActionButton url="/api/omc/ga-crosswalk" body={{ action: "finalise", id: cw.id }} label={majority(yes, com.all.length) ? "Finalise" : `Finalise (needs a majority: ${yes} of ${com.all.length})`} className="btn btn-sm" />}
            </div>
            <details style={{ marginTop: 6 }}><summary className="small-note">History</summary><ul style={{ fontSize: 12 }}>{(() => { try { return (JSON.parse(cw.history) as { at: string; by: string; what: string }[]).map((h, i) => <li key={i}>{new Date(h.at).toLocaleDateString("en-GB")} · {h.by}: {h.what}</li>); } catch { return null; } })()}</ul></details>
          </div>
        );
      })}
    </Shell>
  );
}
