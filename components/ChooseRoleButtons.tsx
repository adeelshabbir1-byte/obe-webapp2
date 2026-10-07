"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DUAL_ROLE_LABEL } from "../lib/dualRoles";

export default function ChooseRoleButtons({ primaryRole = "SUBJECT_EXPERT" }: { primaryRole?: string }) {
  const primaryLabel = DUAL_ROLE_LABEL[primaryRole] || "Subject Expert";
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
      <button onClick={() => choose(primaryRole)} disabled={!!loading} className="btn btn-brass" style={{ flex: 1, padding: "14px 10px" }}>
        {loading === primaryRole ? "Loading…" : `Continue as ${primaryLabel}`}
      </button>
      <button onClick={() => choose("INSTRUCTOR")} disabled={!!loading} className="btn btn-brass" style={{ flex: 1, padding: "14px 10px" }}>
        {loading === "INSTRUCTOR" ? "Loading…" : "Continue as Instructor"}
      </button>
    </div>
  );
}
