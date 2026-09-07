import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";

const ROLE_HOME: Record<string, string> = {
  SUPER_USER: "/admin/users",
  CHAIRMAN: "/chairman/coordinators",
  PROGRAM_COORDINATOR: "/coordinator/faculty",
  SUBJECT_EXPERT: "/subjectexpert/courses",
  OMC: "/omc/queue",
  INSTRUCTOR: "/instructor/courses",
  COURSE_ASSIGNER: "/assigner/matrix",
};

export default async function Dashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  // A dual-capable Subject Expert who hasn't picked a role for this session yet.
  if (user.rawRole === "SUBJECT_EXPERT" && user.secondaryRole === "INSTRUCTOR" && !user.roleChosen) {
    redirect("/choose-role");
  }

  redirect(ROLE_HOME[user.role] || "/login");
}
