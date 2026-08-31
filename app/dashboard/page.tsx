import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";

const ROLE_HOME: Record<string, string> = {
  SUPER_USER: "/admin/users",
  CHAIRMAN: "/chairman/coordinators",
  PROGRAM_COORDINATOR: "/coordinator/faculty",
  SUBJECT_EXPERT: "/subjectexpert/courses",
  // INSTRUCTOR, OMC pages follow the same pattern as the pages already built.
};

export default async function Dashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  redirect(ROLE_HOME[user.role] || "/login");
}
