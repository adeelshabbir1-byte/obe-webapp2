import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CampusAssign from "../../../components/CampusAssign";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { campusesOf, campusSummary, linksOf, chosenCampus, MAIN, CAMPUS_HINT } from "../../../lib/campus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campuses" };

export default async function Campuses() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/home");
  const cid = user.id;
  const cs = await campusesOf(cid);
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Campuses</h1>{c}</Shell>;
  if (!cs) return shell(<div className="err">{CAMPUS_HINT}</div>);
  const sum = await campusSummary(cid);
  const [batches, rooms, staff] = await Promise.all([
    prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] }),
    prisma.room.findMany({ where: { chairmanId: cid }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { isActive: true, OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  const [bl, rl, ul] = await Promise.all([linksOf("BATCH", batches.map((b) => b.id)), linksOf("ROOM", rooms.map((r) => r.id)), linksOf("USER", staff.map((s) => s.id))]);
  const options: [string, string][] = [[MAIN, "Main campus"], ...cs.map((c) => [c.id, c.name] as [string, string])];
  const chosen = chosenCampus();
  return shell(
    <>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>One university, several campuses: the curriculum, academic rules and committees are shared; each batch (its students, courses and timetable), room and staff member belongs to one campus. Anyone can narrow student lists and results to one campus with the filter below.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13 }}><thead><tr><th>Campus</th><th>City</th><th>Batches</th><th>Students</th><th>Courses offered</th><th>Rooms</th><th>Staff</th><th></th></tr></thead>
          <tbody>{sum.map((c) => <tr key={c.id} style={{ background: chosen === c.id ? "#FFF3C4" : undefined }}><td><b>{c.name}</b>{c.code ? ` (${c.code})` : ""}</td><td>{c.city || "—"}</td><td>{c.batches}</td><td>{c.students}</td><td>{c.offered}</td><td>{c.rooms}</td><td>{c.staff}</td>
            <td>{chosen === c.id ? <ActionButton url="/api/campuses" body={{ action: "filter", campus: "" }} label="Show all campuses" className="btn btn-secondary btn-sm" /> : <ActionButton url="/api/campuses" body={{ action: "filter", campus: c.id }} label="Look at this campus only" className="btn btn-secondary btn-sm" />}</td></tr>)}</tbody></table>
        <ActionForm url="/api/campuses" fixed={{ action: "add" }} fields={[{ name: "name", label: "Campus name" }, { name: "city", label: "City" }, { name: "code", label: "Code" }]} submit="Add campus" collapsed openLabel="+ Add a campus" />
      </div>
      {cs.length > 0 && <>
        <div className="card"><h3 style={{ marginTop: 0 }}>Batches</h3><CampusAssign kind="BATCH" campuses={options} items={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}`, campus: bl.get(b.id) || MAIN }))} /></div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Rooms and labs</h3><CampusAssign kind="ROOM" campuses={options} items={rooms.map((r) => ({ id: r.id, label: `${r.name} (${r.type.toLowerCase()})`, campus: rl.get(r.id) || MAIN }))} /></div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Staff</h3><CampusAssign kind="USER" campuses={options} items={staff.map((s) => ({ id: s.id, label: `${s.name} — ${s.role.replace(/_/g, " ").toLowerCase()}`, campus: ul.get(s.id) || MAIN }))} /></div>
      </>}
    </>
  );
}
