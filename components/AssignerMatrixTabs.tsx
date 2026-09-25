"use client";

import { useState } from "react";
import AssignmentMatrix from "./AssignmentMatrix";
import PrimaryInstructorAssigner from "./PrimaryInstructorAssigner";

export default function AssignerMatrixTabs() {
  const [tab, setTab] = useState<"primary" | "sections">("primary");

  return (
    <div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === "primary"} onClick={() => setTab("primary")}>Primary Instructor Assignment</button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "sections"} onClick={() => setTab("sections")}>Section Count Matrix</button>
      </div>
      {tab === "primary" ? <PrimaryInstructorAssigner /> : <AssignmentMatrix />}
    </div>
  );
}
