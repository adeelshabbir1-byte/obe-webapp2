import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";
import OfficialContentPanel from "../../../components/OfficialContentPanel";

export const dynamic = "force-dynamic";

// Platform → Official content: QR-I and QR-II from the HEC QR course outline (and the GE117 / GE118 CLOs), Discrete
// Structures from the institute's own GE116 course data, loaded into each base course; the current plan is saved
// first and can be restored; an OMC-approved plan gets a change request.
export default async function OfficialContentPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "CURRICULUM"))) redirect("/dashboard");
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" as never }, select: { id: true, name: true, instituteName: true }, orderBy: { name: "asc" } });
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={await adminNavFor(user)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Official content</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0, maxWidth: 980 }}>
        Loads the official content into the base course of each course&apos;s sync group (followers update from it): QR-I and QR-II from the HEC QR
        course outline (weekly order, spread over 32 lectures; split lectures say so) with the CLOs of GE117 / GE118; Discrete Structures exactly as
        GE116 has it (topics, sub-topics, CLO tags, week and lecture order; L17 is the mid-term week). Nothing is made up: what the source lacks is
        listed and left empty. The Course Catalog entry is updated too, and the system-generated IDS-D01 is retired (hidden from pickers, kept in the history).
      </p>
      <OfficialContentPanel institutes={heads.map((h) => ({ id: h.id, name: h.instituteName || h.name }))} />
    </Shell>
  );
}
