// Plain display pieces of Accreditation governance, usable from server and client components alike.

export const heat = (p: number) => (p >= 80 ? "#2E7D4F" : p >= 50 ? "#C58A12" : "#B3261E");

export const StatusChip = ({ status }: { status: string }) => {
  const map: Record<string, [string, string]> = { OPEN: ["Not assigned", "badge-no"], ASSIGNED: ["Assigned", "badge-neutral"], RETURNED: ["Returned", "badge-no"], SUBMITTED: ["Signed off", "badge-neutral"], APPROVED: ["Approved", "badge-ok"] };
  const [t, c] = map[status] || [status, ""];
  return <span className={`badge ${c}`}>{t}</span>;
};

export const Bar = ({ pct }: { pct: number }) => (
  <div style={{ background: "var(--line)", borderRadius: 4, height: 7, minWidth: 60 }} aria-hidden="true"><div style={{ width: `${pct}%`, height: "100%", background: heat(pct), borderRadius: 4 }} /></div>
);
