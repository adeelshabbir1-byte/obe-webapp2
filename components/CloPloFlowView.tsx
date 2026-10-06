"use client";

import { useState } from "react";
import CloPloFlowDiagram from "./CloPloFlowDiagram";

type Assessment = { id: string; label: string; type: string; marksPct: number; cloId: string | null };
type Clo = { id: string; code: string; mappedPloId: string | null; contributionPct: number | null };
type Plo = { id: string; number: number; title: string };
type Plan = { assessments: Assessment[]; clos: Clo[]; plos: Plo[]; exists: boolean };
type Mode = "SE" | "INSTRUCTOR" | "COMPARE";

/** Switch between the Subject Expert's plan, the Instructor's plan, and a side-by-side comparison with the differences highlighted. */
export default function CloPloFlowView({ se, instructor, differences, seChanged, instructorChanged, instructorStarted, initialMode }: {
  se: Plan; instructor: Plan; differences: { kind: string; text: string }[];
  seChanged: string[]; instructorChanged: string[]; instructorStarted: boolean; initialMode: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const tabStyle = (m: Mode) => ({ padding: "6px 14px", fontSize: 12.5, cursor: "pointer", border: "1px solid var(--line)", background: mode === m ? "var(--ink, #1f2a44)" : "#fff", color: mode === m ? "#fff" : "inherit", fontWeight: mode === m ? 700 : 400 } as const);
  const flagged = instructorStarted && differences.length > 0;

  const diagram = (plan: Plan, changed: string[], emptyText: string) =>
    plan.assessments.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 12.5 }}>{emptyText}</p> : <CloPloFlowDiagram assessments={plan.assessments} clos={plan.clos} plos={plan.plos} changed={changed} />;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", gap: 0, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode("SE")} style={tabStyle("SE")}>Subject Expert plan</button>
        <button type="button" onClick={() => setMode("INSTRUCTOR")} style={tabStyle("INSTRUCTOR")}>Instructor plan</button>
        <button type="button" onClick={() => setMode("COMPARE")} style={tabStyle("COMPARE")}>Compare{flagged ? ` (${differences.length})` : ""}</button>
      </div>

      {flagged && (
        <div style={{ background: "#FFF3D6", border: "1px solid #F5A300", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>
          <strong>⚑ Instructor plan differs from the Subject Expert plan</strong> in {differences.length} place{differences.length === 1 ? "" : "s"} — flagged for the Coordinator and OMC to review.
          {mode !== "COMPARE" && <> <a href="#" onClick={(e) => { e.preventDefault(); setMode("COMPARE"); }}>See the differences</a></>}
        </div>
      )}
      {!instructorStarted && mode !== "SE" && (
        <div style={{ background: "#EEF1F6", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>The Instructor hasn't set up their own plan for this course yet, so there is nothing to compare.</div>
      )}

      {mode === "SE" && diagram(se, [], "The Subject Expert hasn't defined any assessments for this course yet.")}
      {mode === "INSTRUCTOR" && diagram(instructor, [], "The Instructor hasn't defined any assessments for this course yet.")}
      {mode === "COMPARE" && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 13.5, marginBottom: 6 }}>What differs</h3>
            {!instructorStarted ? null : differences.length === 0
              ? <p style={{ fontSize: 12.5, color: "#2E7D32", fontWeight: 600 }}>The two plans match ✓</p>
              : <ul style={{ fontSize: 12.5, lineHeight: 1.7, paddingLeft: 18 }}>{differences.map((d, i) => <li key={i}>{d.text}</li>)}</ul>}
            <p style={{ fontSize: 11.5, color: "var(--slate)" }}>Boxes outlined in amber are the ones that differ.</p>
          </div>
          <h3 style={{ fontSize: 13.5, marginBottom: 6 }}>Subject Expert plan</h3>
          {diagram(se, seChanged, "The Subject Expert hasn't defined any assessments for this course yet.")}
          <h3 style={{ fontSize: 13.5, margin: "18px 0 6px" }}>Instructor plan</h3>
          {diagram(instructor, instructorChanged, "The Instructor hasn't defined any assessments for this course yet.")}
        </div>
      )}
    </div>
  );
}
