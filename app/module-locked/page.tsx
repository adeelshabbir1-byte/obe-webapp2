import Link from "next/link";
import { getSignedInUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { moduleOf } from "../../lib/modules";

export const dynamic = "force-dynamic";

// Shown when someone opens a page of a module their institute has not switched on.
export default async function ModuleLockedPage({ searchParams }: { searchParams: { m?: string } }) {
  const user = await getSignedInUser();
  const m = moduleOf(searchParams.m || "");
  const body = (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 21, marginTop: 0 }}>{m ? m.label : "This module"} is not switched on for your institute</h1>
      <p style={{ fontSize: 14 }}>{m ? `${m.label} covers: ${m.about}.` : ""} It is not part of your institute&apos;s current OBEHUB subscription.</p>
      <p style={{ fontSize: 14 }}>{user?.role === "CHAIRMAN" ? "To add it, contact the OBEHUB team; it is switched on the same day, with all your existing data." : "If you need it, ask your Institute Head to add it to the subscription."}</p>
      <Link href="/dashboard" className="btn btn-secondary btn-sm">Back to the dashboard</Link>
    </div>
  );
  if (!user) return <div style={{ padding: 24 }}>{body}</div>;
  return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{body}</Shell>;
}
