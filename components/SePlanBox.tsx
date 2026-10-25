import { getAuthenticatedUser } from "../lib/session";
import PlanVotePanel from "./PlanVotePanel";
import AlsoUsedIn from "./AlsoUsedIn";

// On the Subject Expert's course pages: the OMC's votes and suggestions on this plan (with "Added" / "Reply"), and,
// for a course other programs take, the read-only "Also used in …" panel.
export default async function SePlanBox({ courseId, status, showAlso }: { courseId: string; status: string; showAlso: boolean }) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return (
    <div style={{ marginTop: 14 }}>
      {status !== "draft" && <PlanVotePanel courseId={courseId} viewerId={user.id} viewerRole={user.role} />}
      {status === "draft" && <PlanVotePanelIfSynced courseId={courseId} viewerId={user.id} viewerRole={user.role} />}
      {showAlso && <AlsoUsedIn courseId={courseId} />}
    </div>
  );
}
async function PlanVotePanelIfSynced(p: { courseId: string; viewerId: string; viewerRole: string }) {
  const { planApproved } = await import("../lib/registrationGate");
  return (await planApproved([p.courseId])).get(p.courseId)?.synced ? <PlanVotePanel {...p} /> : null;
}
