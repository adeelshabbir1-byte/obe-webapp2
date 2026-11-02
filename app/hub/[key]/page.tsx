import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { HUBS } from "../../../lib/hubMenu";
import { BUILTIN_ARTICLES } from "../../../lib/help/content";
import HubCards from "../../../components/HubCards";
import { aboutPages } from "../../../lib/hubAbout";

export const dynamic = "force-dynamic";

// A hub of the short menu: the cards of one area (Academics, People, Accreditation & quality, Reports, Institute, My work).
export default async function HubPage({ params }: { params: { key: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!HUBS.some((h) => h.key === params.key)) notFound();
  // One line per page: its own help article, else its written line (lib/hubAbout.ts).
  const about = aboutPages(BUILTIN_ARTICLES as never);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <HubCards hubKey={params.key} about={about} />
    </Shell>
  );
}
