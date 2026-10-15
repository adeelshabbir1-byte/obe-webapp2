import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import FacilitiesEditor from "../../components/FacilitiesEditor";
import { checklist, facilitiesScope, loadFacilities, OWNERSHIP, ROOM_TYPES, SERVICE_KINDS, summarize } from "../../lib/facilities";

export const dynamic = "force-dynamic";

// Buildings, rooms and campus services — what PEC, NCEAC and NBEAC visits ask to see about the physical facilities.
export default async function FacilitiesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const scope = await facilitiesScope(user);
  if (!scope) redirect("/dashboard");
  let data: Awaited<ReturnType<typeof loadFacilities>> | null = null;
  try { data = await loadFacilities(scope.chairmanId); } catch { data = null; }
  const s = data ? summarize(data) : null;
  const checks = data && s ? checklist(data, s) : [];
  const done = checks.filter((c) => c.ok).length;
  const tile = (label: string, value: string | number, sub?: string) => (
    <div className="stat stat-neutral" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--slate)" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--slate)" }}>{sub}</div>}
    </div>
  );
  const n = (x: number) => x.toLocaleString("en-US");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Facilities</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14, maxWidth: 900 }}>
        Buildings and their areas, every classroom, lab, hall and office with its size and seating, and campus services such as the hostel, transport and
        dispensary — the physical facilities accreditation visits (PEC, NCEAC, NBEAC) ask about. {scope.canEdit ? "You keep this record." : "Kept by the Facilities Manager."}
      </p>
      {!data && <div className="err">The facilities tables are not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}
      {data && s && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            {tile("Land area", `${n(s.totalArea)} sq ft`, `${s.buildings} building${s.buildings === 1 ? "" : "s"}`)}
            {tile("Covered area", `${n(s.coveredArea)} sq ft`)}
            {tile("Classrooms and halls", s.classrooms, `${n(s.classroomSeats)} seats · ${s.multimediaClassrooms} with multimedia`)}
            {tile("Space per classroom seat", s.areaPerSeat !== null ? `${s.areaPerSeat} sq ft` : "—")}
            {tile("Labs", s.labsRecorded, `${n(s.labSeats)} seats`)}
            {tile("Faculty offices", s.facultyOffices, `${s.faculty} faculty members`)}
            {tile("Students", n(s.students), s.coveredArea && s.students ? `${Math.round((s.coveredArea / s.students) * 10) / 10} sq ft covered per student` : undefined)}
            {tile("Hostel beds", n(s.hostelBeds))}
            {tile("Transport seats", n(s.transportSeats))}
          </div>
          <details className="card" open={done < checks.length}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Inspection checklist — {done} of {checks.length} recorded</summary>
            <p className="small-note">What a facilities inspection usually asks to see. Each item is ticked when it is recorded here (labs and the library are also read from Lab Inventory and Library Inventory).</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
              {checks.map((c) => <div key={c.label} style={{ fontSize: 13 }}><span style={{ color: c.ok ? "var(--sage)" : "var(--rust)", fontWeight: 700 }}>{c.ok ? "✓" : "✗"}</span> {c.label}{c.note ? <span className="small-note"> — {c.note}</span> : null}</div>)}
            </div>
          </details>
          <FacilitiesEditor
            canEdit={scope.canEdit}
            buildings={data.buildings.map((b) => ({ id: b.id, name: b.name, campus: b.campus, totalAreaSqft: b.totalAreaSqft, coveredAreaSqft: b.coveredAreaSqft, floors: b.floors, yearBuilt: b.yearBuilt, ownership: b.ownership, notes: b.notes }))}
            rooms={data.rooms.map((r) => ({ id: r.id, buildingId: r.buildingId, name: r.name, roomType: r.roomType, floor: r.floor, lengthFt: r.lengthFt, widthFt: r.widthFt, capacity: r.capacity, multimedia: r.multimedia, airConditioned: r.airConditioned, notes: r.notes }))}
            services={data.services.map((x) => ({ id: x.id, kind: x.kind, name: x.name, available: x.available, quantity: x.quantity, capacity: x.capacity, staff: x.staff, details: x.details }))}
            roomTypes={ROOM_TYPES} serviceKinds={SERVICE_KINDS} ownership={OWNERSHIP}
          />
        </>
      )}
    </Shell>
  );
}
