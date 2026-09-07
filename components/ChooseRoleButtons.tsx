"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChooseRoleButtons() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function choose(role: string) {
    setLoading(role);
    await fetch("/api/auth/set-active-role", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
      <button onClick={() => choose("SUBJECT_EXPERT")} disabled={!!loading} className="btn btn-brass" style={{ flex: 1, padding: "14px 10px" }}>
        {loading === "SUBJECT_EXPERT" ? "Loading…" : "Continue as Subject Expert"}
      </button>
      <button onClick={() => choose("INSTRUCTOR")} disabled={!!loading} className="btn btn-brass" style={{ flex: 1, padding: "14px 10px" }}>
        {loading === "INSTRUCTOR" ? "Loading…" : "Continue as Instructor"}
      </button>
    </div>
  );
}
