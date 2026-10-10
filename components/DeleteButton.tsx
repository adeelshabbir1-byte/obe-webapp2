"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteButton({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    await fetch(endpoint, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={onClick} disabled={loading} className="act act-danger">
      {loading ? "…" : "Remove"}
    </button>
  );
}
