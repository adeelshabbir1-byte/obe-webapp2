"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Building = { id: string; name: string; campus: string | null; totalAreaSqft: number | null; coveredAreaSqft: number | null; floors: number | null; yearBuilt: number | null; ownership: string | null; notes: string | null };
type Room = { id: string; buildingId: string; name: string; roomType: string; floor: string | null; lengthFt: number | null; widthFt: number | null; capacity: number | null; multimedia: boolean; airConditioned: boolean; notes: string | null };
type Service = { id: string; kind: string; name: string; available: boolean; quantity: number | null; capacity: number | null; staff: number | null; details: string | null };
type Kinds = Record<string, { label: string; quantity?: string; capacity?: string; staff?: string; hint: string }>;

const val = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));

async function call(method: "POST" | "DELETE", body: Record<string, unknown> | null, query = "") {
  const res = await fetch(`/api/facilities${query}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, data } : { ok: false as const, error: (data.error as string) || "Could not save." };
}

export default function FacilitiesEditor({ canEdit, buildings, rooms, services, roomTypes, serviceKinds, ownership }: {
  canEdit: boolean; buildings: Building[]; rooms: Room[]; services: Service[]; roomTypes: Record<string, string>; serviceKinds: Kinds; ownership: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState<Partial<Building> | null>(null);
  const [r, setR] = useState<Partial<Room> | null>(null);
  const [s, setS] = useState<Partial<Service> | null>(null);

  async function save(entity: string, data: Record<string, unknown>, done: () => void) {
    setBusy(true); setError("");
    const res = await call("POST", { entity, ...data });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    done(); router.refresh();
  }
  async function remove(entity: string, id: string, what: string) {
    if (!confirm(`Remove ${what}?`)) return;
    setBusy(true); setError("");
    const res = await call("DELETE", null, `?entity=${entity}&id=${encodeURIComponent(id)}`);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }
  async function importRooms(buildingId: string) {
    setBusy(true); setError("");
    const res = await call("POST", { entity: "import-timetable-rooms", buildingId });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    alert(`${res.data.imported} room${res.data.imported === 1 ? "" : "s"} copied from the timetable. Add their dimensions and multimedia below.`);
    router.refresh();
  }
  const input = (label: string, value: string, on: (v: string) => void, type = "text", w = 140) => (
    <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{label}<input type={type} value={value} onChange={(e) => on(e.target.value)} style={{ width: w }} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} /></label>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Buildings</h3>
          {canEdit && !b && <button type="button" className="btn btn-brass btn-sm" onClick={() => setB({ ownership: "OWNED" })}>Add building</button>}
        </div>
        {b && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "12px 0", padding: 12, border: "1px dashed var(--line)", borderRadius: 8 }}>
            {input("Name", b.name || "", (v) => setB({ ...b, name: v }), "text", 200)}
            {input("Campus", b.campus || "", (v) => setB({ ...b, campus: v }))}
            {input("Land area (sq ft)", val(b.totalAreaSqft), (v) => setB({ ...b, totalAreaSqft: v === "" ? null : Number(v) }), "number")}
            {input("Covered area (sq ft)", val(b.coveredAreaSqft), (v) => setB({ ...b, coveredAreaSqft: v === "" ? null : Number(v) }), "number")}
            {input("Floors", val(b.floors), (v) => setB({ ...b, floors: v === "" ? null : Number(v) }), "number", 80)}
            {input("Year built", val(b.yearBuilt), (v) => setB({ ...b, yearBuilt: v === "" ? null : Number(v) }), "number", 90)}
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Ownership<select value={b.ownership || ""} onChange={(e) => setB({ ...b, ownership: e.target.value })}><option value="">—</option>{Object.entries(ownership).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {input("Notes", b.notes || "", (v) => setB({ ...b, notes: v }), "text", 260)}
            <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save("building", b, () => setB(null))}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setB(null)}>Cancel</button>
          </div>
        )}
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Building</th><th>Land area</th><th>Covered area</th><th>Floors</th><th>Rooms</th><th>Ownership</th><th></th></tr></thead>
          <tbody>
            {buildings.length === 0 && <tr><td colSpan={7} className="small-note">No buildings yet.</td></tr>}
            {buildings.map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b>{x.campus && <div className="small-note">{x.campus}</div>}{x.notes && <div className="small-note">{x.notes}</div>}</td>
                <td>{fmt(x.totalAreaSqft)} sq ft</td><td>{fmt(x.coveredAreaSqft)} sq ft</td><td>{x.floors ?? "—"}</td>
                <td>{rooms.filter((y) => y.buildingId === x.id).length}</td><td>{x.ownership ? ownership[x.ownership] : "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{canEdit && <>
                  <button type="button" className="act act-primary" onClick={() => setB(x)}>Edit</button>{" "}
                  <button type="button" className="act act-neutral" disabled={busy} onClick={() => importRooms(x.id)} title="Copy the timetable's rooms into this building">Copy timetable rooms</button>{" "}
                  <button type="button" className="act act-danger" onClick={() => remove("building", x.id, x.name)}>Remove</button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Rooms and halls</h3>
          {canEdit && !r && buildings.length > 0 && <button type="button" className="btn btn-brass btn-sm" onClick={() => setR({ buildingId: buildings[0].id, roomType: "CLASSROOM", multimedia: false, airConditioned: false })}>Add room</button>}
        </div>
        {canEdit && buildings.length === 0 && <p className="small-note">Add a building first.</p>}
        {r && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "12px 0", padding: 12, border: "1px dashed var(--line)", borderRadius: 8 }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Building<select value={r.buildingId} onChange={(e) => setR({ ...r, buildingId: e.target.value })}>{buildings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            {input("Room name / number", r.name || "", (v) => setR({ ...r, name: v }))}
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Type<select value={r.roomType} onChange={(e) => setR({ ...r, roomType: e.target.value })}>{Object.entries(roomTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {input("Floor", r.floor || "", (v) => setR({ ...r, floor: v }), "text", 70)}
            {input("Length (ft)", val(r.lengthFt), (v) => setR({ ...r, lengthFt: v === "" ? null : Number(v) }), "number", 90)}
            {input("Width (ft)", val(r.widthFt), (v) => setR({ ...r, widthFt: v === "" ? null : Number(v) }), "number", 90)}
            {input("Seating capacity", val(r.capacity), (v) => setR({ ...r, capacity: v === "" ? null : Number(v) }), "number", 100)}
            <label style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={!!r.multimedia} onChange={(e) => setR({ ...r, multimedia: e.target.checked })} /> Multimedia</label>
            <label style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={!!r.airConditioned} onChange={(e) => setR({ ...r, airConditioned: e.target.checked })} /> Air-conditioned</label>
            {input("Notes", r.notes || "", (v) => setR({ ...r, notes: v }), "text", 200)}
            <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save("room", r, () => setR(null))}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setR(null)}>Cancel</button>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Room</th><th>Type</th><th>Building / floor</th><th>Size (ft)</th><th>Area</th><th>Seats</th><th>Sq ft / seat</th><th>Facilities</th><th></th></tr></thead>
            <tbody>
              {rooms.length === 0 && <tr><td colSpan={9} className="small-note">No rooms yet.</td></tr>}
              {rooms.map((x) => {
                const area = x.lengthFt && x.widthFt ? Math.round(x.lengthFt * x.widthFt) : null;
                return (
                  <tr key={x.id}>
                    <td><b>{x.name}</b>{x.notes && <div className="small-note">{x.notes}</div>}</td>
                    <td>{roomTypes[x.roomType] || x.roomType}</td>
                    <td>{buildings.find((y) => y.id === x.buildingId)?.name || "—"}{x.floor ? ` · ${x.floor}` : ""}</td>
                    <td>{x.lengthFt && x.widthFt ? `${x.lengthFt} × ${x.widthFt}` : "—"}</td>
                    <td>{area ? `${area.toLocaleString("en-US")} sq ft` : "—"}</td>
                    <td>{x.capacity ?? "—"}</td>
                    <td>{area && x.capacity ? Math.round((area / x.capacity) * 10) / 10 : "—"}</td>
                    <td style={{ fontSize: 12 }}>{[x.multimedia ? "Multimedia" : "", x.airConditioned ? "AC" : ""].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{canEdit && <><button type="button" className="act act-primary" onClick={() => setR(x)}>Edit</button>{" "}<button type="button" className="act act-danger" onClick={() => remove("room", x.id, x.name)}>Remove</button></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Campus services</h3>
          {canEdit && !s && <button type="button" className="btn btn-brass btn-sm" onClick={() => setS({ kind: "HOSTEL", available: true })}>Add service</button>}
        </div>
        {s && (() => {
          const k = serviceKinds[s.kind || "OTHER"] || serviceKinds.OTHER;
          return (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "12px 0", padding: 12, border: "1px dashed var(--line)", borderRadius: 8 }}>
              <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Service<select value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value })}>{Object.entries(serviceKinds).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select></label>
              {input("Name", s.name || "", (v) => setS({ ...s, name: v }), "text", 180)}
              {k.quantity && input(k.quantity, val(s.quantity), (v) => setS({ ...s, quantity: v === "" ? null : Number(v) }), "number", 110)}
              {k.capacity && input(k.capacity, val(s.capacity), (v) => setS({ ...s, capacity: v === "" ? null : Number(v) }), "number", 110)}
              {k.staff && input(k.staff, val(s.staff), (v) => setS({ ...s, staff: v === "" ? null : Number(v) }), "number", 110)}
              <label style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={s.available !== false} onChange={(e) => setS({ ...s, available: e.target.checked })} /> Available</label>
              <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 260px" }}>Details{k.hint ? ` (${k.hint})` : ""}<textarea rows={2} value={s.details || ""} onChange={(e) => setS({ ...s, details: e.target.value })} /></label>
              <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save("service", s, () => setS(null))}>Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setS(null)}>Cancel</button>
            </div>
          );
        })()}
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Service</th><th>Figures</th><th>Details</th><th></th></tr></thead>
          <tbody>
            {services.length === 0 && <tr><td colSpan={4} className="small-note">No services recorded yet — add the hostel, transport, dispensary, cafeteria and the rest.</td></tr>}
            {services.map((x) => {
              const k = serviceKinds[x.kind] || serviceKinds.OTHER;
              const figures = [k.quantity && x.quantity !== null ? `${k.quantity}: ${x.quantity}` : "", k.capacity && x.capacity !== null ? `${k.capacity}: ${x.capacity}` : "", k.staff && x.staff !== null ? `${k.staff}: ${x.staff}` : ""].filter(Boolean).join(" · ");
              return (
                <tr key={x.id} style={x.available ? undefined : { opacity: 0.6 }}>
                  <td><b>{x.name}</b><div className="small-note">{k.label}{x.available ? "" : " · not available"}</div></td>
                  <td style={{ fontSize: 12.5 }}>{figures || "—"}</td>
                  <td style={{ fontSize: 12.5, maxWidth: 420, whiteSpace: "pre-wrap" }}>{x.details || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{canEdit && <><button type="button" className="act act-primary" onClick={() => setS(x)}>Edit</button>{" "}<button type="button" className="act act-danger" onClick={() => remove("service", x.id, x.name)}>Remove</button></>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
