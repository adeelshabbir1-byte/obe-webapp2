"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { putAssignSe } from "../lib/assignSeClient";

export default function AssignSubjectExpertSelect({ courseId, currentId, options }: {
  courseId: string; currentId: string | null; options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const el = e.target;
    setLoading(true);
    const { ok, data } = await putAssignSe(courseId, el.value || null, {});
    setLoading(false);
    if (!ok) { el.value = currentId || ""; window.alert(data.error || "Couldn't assign."); return; }
    router.refresh();
  }

  return (
    <select defaultValue={currentId || ""} onChange={onChange} disabled={loading} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
      <option value="">— Unassigned —</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
