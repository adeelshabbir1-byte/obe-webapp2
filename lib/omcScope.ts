// An OMC member belongs to one department and reviews only that department's coordinators, courses and Subject Experts.
// (An OMC member with no department yet still sees the whole institute, as before.)
export function deptScope(user: { role: string; departmentId?: string | null }): { departmentId?: string } {
  return (user.role === "OMC" || user.role === "COURSE_ASSIGNER") && user.departmentId ? { departmentId: user.departmentId } : {};
}

/**
 * The courses an OMC member of a department looks after: every course whose subject the department handles (its
 * subject home), wherever it is offered, plus the courses its own programs offer that have no subject home set.
 * So a Computing OMC reviews Programming even in another department's program, and the Mathematics OMC reviews
 * Calculus in the Computing programs. With no department set: the whole institute (the caller limits the institute).
 */
export function omcCourseScope(user: { role: string; departmentId?: string | null }): Record<string, unknown> {
  if (user.role !== "OMC" || !user.departmentId) return {};
  const d = user.departmentId;
  return { OR: [{ subjectHomeDepartmentId: d }, { subjectHomeDepartmentId: null, coordinator: { departmentId: d } }] };
}
/** Program Leads whose courses are looked at: for an OMC member every lead of the institute (the course scope above does the narrowing). */
export function omcLeadScope(user: { role: string; departmentId?: string | null }): { departmentId?: string } {
  return user.role === "OMC" ? {} : deptScope(user);
}
