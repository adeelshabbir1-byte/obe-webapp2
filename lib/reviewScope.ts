import { chairmanIdFor } from "./reportScope";

export const REVIEW_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];

/** Which batches an accreditation reviewer can see: a Program Lead their own programs, everyone else the whole institute. */
export async function reviewBatchWhere(user: { id: string; role: string; managedById: string | null }) {
  if (!REVIEW_ROLES.includes(user.role)) return null;
  if (user.role === "PROGRAM_COORDINATOR") return { coordinatorId: user.id };
  const cid = await chairmanIdFor(user);
  return cid ? { coordinator: { managedById: cid } } : null;
}
