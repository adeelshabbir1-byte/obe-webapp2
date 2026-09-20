"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type MCourse = { id: string; code: string; title: string; category: string; domain: string | null; semesterNumber: number | null };

export default function ProgramCopyBuilder({ sourceCurriculumId, courses }: { sourceCurriculumId: string; courses: MCourse[] }) {
  const router = useRouter();
  const [degreeProgram, setDegreeProgram] = useState("");
  const [title, setTitle] = useState("");
  const [selectedElectiveIds, setSelectedElectiveIds] = useState<Set<string>>(new Set());
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const core = useMemo(() => courses.filter((c) => c.category === "Major" || c.category === "General Education / Other"), [courses]);
  const electivesByDomain = useMemo(() => {
    const map = new Map<string, MCourse[]>();
    for (const c of courses) {
      if (c.category !== "Domain Elective") continue;
      const key = c.domain || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [courses]);

  function toggleDomain(domain: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain); else next.add(domain);
      return next;
    });
  }

  function toggleElective(id: string) {
    setSelectedElectiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllInDomain(domain: string) {
    const ids = (electivesByDomain.get(domain) || []).map((c) => c.id);
    setSelectedElectiveIds((prev) => new Set([...prev, ...ids]));
  }

  function clearDomain(domain: string) {
    const ids = new Set((electivesByDomain.get(domain) || []).map((c) => c.id));
    setSelectedElectiveIds((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  }

  async function submit() {
    if (!degreeProgram.trim() || !title.trim()) { setError("Degree program and curriculum title are required."); return; }
    setLoading(true); setError("");
    try {
      const courseIds = [...core.map((c) => c.id), ...selectedElectiveIds];
      const res = await fetch(`/api/admin/curricula/${sourceCurriculumId}/create-program-copy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, degreeProgram, courseIds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      router.push(`/admin/curricula/${data.curriculumId}`);
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Degree Program</label>
          <input value={degreeProgram} onChange={(e) => setDegreeProgram(e.target.value)} placeholder="e.g. BS Artificial Intelligence" style={{ width: "100%", padding: 6, fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>New Curriculum Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. BS Artificial Intelligence - HEC 2025" style={{ width: "100%", padding: 6, fontSize: 13 }} />
        </div>
      </div>

      {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      <div style={{ marginBottom: 24, padding: 12, background: "#FAFAF8", border: "1px solid var(--line)" }}>
        <h3 style={{ fontSize: 13, marginBottom: 6 }}>Always included — shared core ({core.length} courses)</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>
          Mandatory Major and General Education / Other courses apply to every program and are included automatically.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {core.map((c) => (
            <span key={c.id} style={{ fontSize: 11, padding: "2px 8px", background: "#fff", border: "1px solid var(--line)", borderRadius: 3 }}>
              {c.title}{c.semesterNumber ? ` (Sem ${c.semesterNumber})` : ""}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, marginBottom: 4 }}>
          Choose electives — {selectedElectiveIds.size} selected <span style={{ fontWeight: 400, color: "var(--slate)" }}>(typically 8 per program)</span>
        </h3>
        {[...electivesByDomain.keys()].sort().map((domain) => {
          const list = electivesByDomain.get(domain)!;
          const selectedInDomain = list.filter((c) => selectedElectiveIds.has(c.id)).length;
          const isExpanded = expandedDomains.has(domain);
          return (
            <div key={domain} style={{ border: "1px solid var(--line)", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#FAFAF8", cursor: "pointer" }} onClick={() => toggleDomain(domain)}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{isExpanded ? "▾" : "▸"} {domain} ({list.length} courses, {selectedInDomain} selected)</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button onClick={(e) => { e.stopPropagation(); selectAllInDomain(domain); }} style={{ fontSize: 10.5, background: "none", border: "1px solid var(--line)", padding: "2px 6px", cursor: "pointer" }}>Select all</button>
                  <button onClick={(e) => { e.stopPropagation(); clearDomain(domain); }} style={{ fontSize: 10.5, background: "none", border: "1px solid var(--line)", padding: "2px 6px", cursor: "pointer" }}>Clear</button>
                </span>
              </div>
              {isExpanded && (
                <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {list.map((c) => (
                    <label key={c.id} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--line)", borderRadius: 3, background: selectedElectiveIds.has(c.id) ? "#F0EAD6" : "#fff" }}>
                      <input type="checkbox" checked={selectedElectiveIds.has(c.id)} onChange={() => toggleElective(c.id)} />
                      {c.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={submit} disabled={loading} className="btn btn-brass">
        {loading ? "Creating…" : `Create Program Copy (${core.length + selectedElectiveIds.size} courses)`}
      </button>
    </div>
  );
}
