"use client";

import { useState } from "react";
import AssignmentMatrix from "./AssignmentMatrix";
import PrimaryInstructorAssigner from "./PrimaryInstructorAssigner";

export default function AssignerMatrixTabs() {
  const [tab, setTab] = useState<"primary" | "sections">("primary");

  const tabStyle = (active: boolean) => ({
    padding: "8px 16px", border: "1px solid var(--line)", borderBottom: active ? "2px solid var(--brass)" : "1px solid var(--line)",
    background: active ? "var(--card)" : "#F4F2FB", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "var(--ink)" : "var(--slate)",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <button onClick={() => setTab("primary")} style={tabStyle(tab === "primary")}>Primary Instructor Assignment</button>
        <button onClick={() => setTab("sections")} style={tabStyle(tab === "sections")}>Section Count Matrix</button>
      </div>
      {tab === "primary" ? <PrimaryInstructorAssigner /> : <AssignmentMatrix />}
    </div>
  );
}
