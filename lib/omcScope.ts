// An OMC member belongs to one department and reviews only that department's coordinators, courses and Subject Experts.
// (An OMC member with no department yet still sees the whole institute, as before.)
export function deptScope(user: { role: string; departmentId?: string | null }): { departmentId?: string } {
  return user.role === "OMC" && user.departmentId ? { departmentId: user.departmentId } : {};
}
