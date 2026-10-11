// Client helper for PUT /api/coordinator/courses/[id]/assign-se. When the server says a reason is needed
// (taking a course away from a Subject Expert who already submitted or got it approved), it asks once and retries.
export async function putAssignSe(courseId: string, subjectExpertId: string | null, reasonBox: { reason?: string | null }) {
  const send = () => fetch(`/api/coordinator/courses/${courseId}/assign-se`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectExpertId: subjectExpertId || null, reason: reasonBox.reason || undefined }),
  });
  let res = await send();
  let data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.code === "REASON_REQUIRED") {
    if (reasonBox.reason === null) return { ok: false, data: { error: "Cancelled — nothing changed." } };
    const r = window.prompt(`${data.error}\n\nReason (recorded in the audit log and shown to the Subject Expert):`);
    if (!r || r.trim().length < 5) { reasonBox.reason = null; return { ok: false, data: { error: "A reason of at least 5 characters is needed — nothing changed." } }; }
    reasonBox.reason = r.trim();
    res = await send();
    data = await res.json().catch(() => ({}));
  }
  return { ok: res.ok, data };
}
