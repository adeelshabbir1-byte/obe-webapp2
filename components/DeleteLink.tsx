"use client";
import { useRouter } from "next/navigation";
export default function DeleteLink({ url, label = "Remove" }: { url: string; label?: string }) {
  const router = useRouter();
  return <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await fetch(url, { method: "DELETE" }); router.refresh(); }}>{label}</button>;
}
