// Plain display pieces of Accreditation governance, usable from server and client components alike.
import { StatusBadge } from "../Meaning";

export const heat = (p: number) => (p >= 80 ? "#2E7D4F" : p >= 50 ? "#C58A12" : "#B3261E");

// A task's status, with its meaning on hover / tap.
export const StatusChip = ({ status }: { status: string }) => <StatusBadge status={status} />;

export const Bar = ({ pct }: { pct: number }) => (
  <div style={{ background: "var(--line)", borderRadius: 4, height: 7, minWidth: 60 }} aria-hidden="true"><div style={{ width: `${pct}%`, height: "100%", background: heat(pct), borderRadius: 4 }} /></div>
);
