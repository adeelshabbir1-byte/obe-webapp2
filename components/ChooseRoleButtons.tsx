"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DUAL_ROLE_LABEL } from "../lib/dualRoles";

export default function ChooseRoleButtons({ roles }: { roles: string[] }) {
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
    <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
      {roles.map((r) => (
        <button key={r} onClick={() => choose(r)} disabled={!!loading} className="btn btn-brass" style={{ flex: 1, minWidth: 150, padding: "14px 10px" }}>
          {loading === r ? "Loading…" : `Continue as ${DUAL_ROLE_LABEL[r] || r}`}
        </button>
      ))}
    </div>
  );
}
