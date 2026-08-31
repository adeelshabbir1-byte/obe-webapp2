"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AssignSubjectExpertSelect({ courseId, currentId, options }: {
  courseId: string; currentId: string | null; options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLoading(true);
    await fetch(`/api/coordinator/courses/${courseId}/assign-se`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectExpertId: e.target.value || null }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <select defaultValue={currentId || ""} onChange={onChange} disabled={loading} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
      <option value="">— Unassigned —</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
