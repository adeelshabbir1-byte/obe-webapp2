"use client";

import { useState } from "react";
import AssignmentMatrix from "./AssignmentMatrix";
import PrimaryInstructorAssigner from "./PrimaryInstructorAssigner";
import AutoAllocation from "./AutoAllocation";
import YearAllocation from "./YearAllocation";

export default function AssignerMatrixTabs() {
  const [tab, setTab] = useState<"auto" | "primary" | "sections" | "year">("primary");

  return (
    <div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === "auto"} onClick={() => setTab("auto")}>Suggested Allocation</button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "year"} onClick={() => setTab("year")}>Full Year</button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "primary"} onClick={() => setTab("primary")}>Primary Instructor Assignment</button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "sections"} onClick={() => setTab("sections")}>Section Count Matrix</button>
      </div>
      {tab === "year" ? <YearAllocation /> : tab === "auto" ? <AutoAllocation onApplied={() => setTab("sections")} /> : tab === "primary" ? <PrimaryInstructorAssigner /> : <AssignmentMatrix />}
    </div>
  );
}
