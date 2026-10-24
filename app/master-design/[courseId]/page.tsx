import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import MasterCourseEditor from "../../../components/MasterCourseEditor";

export default async function MasterDesignPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT" || !user.isPlatformExpert) redirect("/dashboard");
  return (
    <Shell roleLabel="National Subject Expert" userName={user.name} navLinks={[{ href: "/master-design", label: "My National Courses" }, { href: "/platform", label: "My Platform Roles" }]}>
      <MasterCourseEditor courseId={params.courseId} />
    </Shell>
  );
}
