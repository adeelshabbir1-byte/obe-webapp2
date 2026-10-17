import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { TOUR_CATALOGUE } from "../../lib/tourSteps";
import TourStartButton from "../../components/TourStartButton";

export const dynamic = "force-dynamic";

// The tour is made for the signed-in role: only screens this person can open, in story order.
export default async function TourStart() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const nav = new Set(["/dashboard", ...navForRole(user.role).map((l) => l.href)]);
  const steps = TOUR_CATALOGUE.filter((s) => nav.has(s.href));
  return (
    <div style={{ maxWidth: 640, margin: "60px auto", padding: 24, background: "#fff", borderRadius: 12, border: "1px solid #E6DADC" }}>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Presentation tour</h1>
      <p style={{ fontSize: 14 }}>A guided walk through the {steps.length} key screens open to you as <b>{roleLabel(user.role)}</b>, with a short explanation on each. Sign in with another role (for example the Program Lead <b>dream.lead.cs</b> in the demo institute) to see that role&apos;s screens.</p>
      <ol style={{ fontSize: 13.5 }}>{steps.map((s) => <li key={s.href}>{s.title}</li>)}</ol>
      <TourStartButton steps={steps} />
    </div>
  );
}
