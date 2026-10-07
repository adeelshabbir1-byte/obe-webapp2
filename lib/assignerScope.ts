// A Course Assigner works for one department: the Program Leads, courses and teachers of that department only.
// (An assigner account with no department yet still sees the whole institute, as before.)
export function assignerDept(user: { departmentId?: string | null }): { departmentId?: string } {
  return user.departmentId ? { departmentId: user.departmentId } : {};
}
