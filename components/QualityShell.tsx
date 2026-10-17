import Shell from "./Shell";
import { navForRole } from "./reportNav";
import { roleLabel } from "../lib/reportScope";

/** Page frame for the accreditation-gap tools: title, a one-line purpose and a reminder to check the council's current manual. */
export default function QualityShell({ user, title, intro, children }: { user: { role: string; name: string }; title: string; intro: string; children: React.ReactNode }) {
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>
      <p className="small-note" style={{ marginBottom: 12 }}>{intro}</p>
      {children}
    </Shell>
  );
}
