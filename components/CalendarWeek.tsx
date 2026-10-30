import { DAY_NAMES, addDays, dowOf, hm, localDay, localMin, type Item } from "../lib/calendarCore";

// One week of a teacher's calendar, a column per day: busy items (with details or just "Busy", as the teacher allows)
// and, for people booking, the free slots. Server-rendered; it reflows to one column on phones.

const COLOUR: Record<string, [string, string]> = {
  CLASS: ["#E8EEF9", "#3B5BA5"], COUNSELLING: ["#EAF5EE", "#2F7A4D"], BLOCK: ["#F3EEE6", "#8A6D3B"],
  EXTERNAL: ["#EFEFEF", "#666"], APPOINTMENT: ["#FCEBEF", "#8B1E3F"],
};
const KIND: Record<string, string> = { CLASS: "Class", COUNSELLING: "Counselling", BLOCK: "Blocked", EXTERNAL: "Calendar", APPOINTMENT: "Appointment" };

export default function CalendarWeek({ monday, items, free = [], days = 7 }: { monday: string; items: Item[]; free?: { start: number; end: number }[]; days?: number }) {
  const cols = Array.from({ length: days }, (_, i) => addDays(monday, i));
  const today = localDay(Date.now());
  return (
    <div className="cal-week" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 130px), 1fr))`, gap: 6 }}>
      {cols.map((d) => {
        const mine = items.filter((i) => localDay(i.start) === d);
        const open = free.filter((f) => localDay(f.start) === d);
        return (
          <div key={d} className="card" style={{ margin: 0, padding: 8, minHeight: 90, borderColor: d === today ? "var(--brass, #B08D57)" : undefined }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{DAY_NAMES[dowOf(d)]} <span className="small-note">{d.slice(8)}/{d.slice(5, 7)}</span></div>
            {mine.length === 0 && open.length === 0 && <div className="small-note">—</div>}
            {mine.map((i, k) => {
              const [bg, fg] = COLOUR[i.kind] || COLOUR.BLOCK;
              return (
                <div key={k} title={`${KIND[i.kind] || ""} ${hm(localMin(i.start))}–${hm(localMin(i.end))} ${i.label}`} style={{ background: bg, borderLeft: `3px solid ${fg}`, borderRadius: 4, padding: "3px 5px", marginBottom: 4, fontSize: 12, lineHeight: 1.3 }}>
                  <b style={{ color: fg }}>{hm(localMin(i.start))}–{hm(localMin(i.end))}</b>
                  <div style={{ overflowWrap: "anywhere" }}>{i.label}</div>
                </div>
              );
            })}
            {open.length > 0 && <div className="small-note" style={{ marginTop: 4 }}>Free: {open.map((f) => hm(localMin(f.start))).join(", ")}</div>}
          </div>
        );
      })}
    </div>
  );
}
