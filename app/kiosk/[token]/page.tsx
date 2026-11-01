import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { onDate } from "../../../lib/timetableLive";
import { hh } from "../../../lib/timetableCore";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// Screen outside a room / on a floor (Adeel prompt §23.5): now and next class per room, refreshing every minute.
// No login; a private, revocable display link.
export default async function KioskPage({ params }: { params: { token: string } }) {
  const t = await db.timetableToken?.findUnique({ where: { token: params.token } }).catch(() => null);
  if (!t || t.revokedAt || t.kind !== "KIOSK") notFound();
  const now = new Date(Date.now() + 5 * 3600e3); // Pakistan time
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const list = (await onDate(t.chairmanId, now)).filter((c) => !t.roomId || c.roomId === t.roomId);
  const rooms = Array.from(new Set(list.map((c) => c.roomName))).sort();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#111", color: "#fff", minHeight: "100vh", padding: 24, position: "fixed", inset: 0, overflow: "auto", zIndex: 9999 }}>
        <script dangerouslySetInnerHTML={{ __html: "setTimeout(function(){location.reload()},60000)" }} />
        <h1 style={{ margin: "0 0 12px" }}>{t.label || "Classes"} · {hh(hour)}</h1>
        <table style={{ width: "100%", fontSize: 26, borderCollapse: "collapse" }}><thead><tr style={{ textAlign: "left", color: "#aaa" }}><th>Room</th><th>Now</th><th>Next</th></tr></thead>
          <tbody>{rooms.map((r) => { const rs = list.filter((c) => c.roomName === r); const cur = rs.find((c) => c.startHour <= hour && hour < c.endHour); const nxt = rs.find((c) => c.startHour > hour);
            const cell = (c?: (typeof rs)[number]) => c ? <>{c.status === "CANCELLED" ? <s>{c.courseCode}</s> : c.courseCode} <span style={{ color: "#aaa", fontSize: 20 }}>{hh(c.startHour)}–{hh(c.endHour)} · {c.substitute || c.instructorName}{c.status === "CANCELLED" ? " · cancelled" : c.status === "MOVED" ? " · moved" : ""}</span></> : <span style={{ color: "#666" }}>—</span>;
            return <tr key={r} style={{ borderTop: "1px solid #333" }}><td style={{ padding: "10px 0" }}><b>{r}</b></td><td>{cell(cur)}</td><td>{cell(nxt)}</td></tr>; })}</tbody></table>
    </div>
  );
}
