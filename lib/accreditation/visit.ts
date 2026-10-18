import { prisma } from "../db";
import type { BodyKey } from "./bodyInfer";

export const vdb = prisma as unknown as Record<string, any>;
export type VItem = { id: string; cycleId: string; kind: string; sort: number; dataJson: string; status: string; ownerId: string | null; dueDate: Date | null };
export const FINDING_TYPES: [string, string][] = [["STRENGTH", "Strength"], ["CONCERN", "Concern"], ["WEAKNESS", "Weakness"], ["DEFICIENCY", "Deficiency"], ["OBSERVATION", "Observation"]];

/** A typical two-day visit; the program edits times, venues and hosts. */
export function agendaTemplate(body: BodyKey): { day: string; time: string; session: string; with: string; venue: string }[] {
  const ind = body === "PEC" ? "Industrial Advisory Board, alumni and employers" : body === "NBEAC" ? "Alumni, employers and corporate partners" : "Alumni and employers";
  return [
    { day: "Day 1", time: "09:00", session: "Opening meeting", with: "Institute Head, Dean, Chairman", venue: "Board room" },
    { day: "Day 1", time: "09:45", session: "Program presentation: mission, PEOs, GAs, assessment and CQI", with: "Program Lead, faculty", venue: "Board room" },
    { day: "Day 1", time: "11:00", session: "Review of course files, assessment evidence and work samples", with: "Program Coordinator", venue: "Evidence room" },
    { day: "Day 1", time: "13:00", session: "Lunch", with: "Panel", venue: "Guest room" },
    { day: "Day 1", time: "14:00", session: "Meeting with faculty", with: "Full-time faculty (without management)", venue: "Seminar room" },
    { day: "Day 1", time: "15:00", session: body === "PEC" ? "Laboratories, workshops and safety" : "Laboratories and facilities tour", with: "Lab Manager, Lab Engineers", venue: "Labs" },
    { day: "Day 1", time: "16:00", session: "Library visit", with: "Librarian", venue: "Library" },
    { day: "Day 2", time: "09:00", session: "Meeting with students (all years, without faculty)", with: "Students", venue: "Seminar room" },
    { day: "Day 2", time: "10:00", session: `Meeting with ${ind}`, with: ind, venue: "Board room" },
    { day: "Day 2", time: "11:00", session: "Meeting with support staff", with: "Admin, IT, lab and library staff", venue: "Seminar room" },
    { day: "Day 2", time: "12:00", session: "Finance, admissions and student affairs", with: "Finance Officer, Student Affairs", venue: "Board room" },
    { day: "Day 2", time: "14:00", session: "Panel's private session", with: "Panel only", venue: "Evidence room" },
    { day: "Day 2", time: "15:30", session: "Exit meeting: preliminary findings", with: "Institute Head, Dean, Chairman, Program Lead", venue: "Board room" },
  ];
}
export const LOGISTICS = ["Panel travel and accommodation confirmed", "Board room with projector and Wi-Fi", "Refreshments and lunch for panel and participants", "Evidence room set up (SAR, minutes, surveys, policies)", "Course files arranged by semester", "Work samples (best / average / weakest) available", "Printed copies of the SAR and visit agenda", "Students from all years invited", "Alumni and employers invited and confirmed", "Labs working, manuals and safety signs displayed", "Escort / liaison officer named for the panel", "Name tags and seating plan", "Photographs and attendance sheets for each meeting"];

export const data = (i: { dataJson: string }) => { try { return JSON.parse(i.dataJson) as Record<string, string>; } catch { return {} as Record<string, string>; } };

/* ---------------- Rebuttals and follow-up of findings ----------------
 * Each finding (VisitItem kind FINDING) also keeps, in its dataJson:
 *   position: ACCEPT | PARTIAL | REBUT, rebuttal (our argument), evidence: [{ name, url }]
 *   decision: PENDING | ACCEPTED | PARTLY | REJECTED (the council's ruling on a rebuttal), decisionNote
 *   progress: [{ on, pct, note, by }] (work on an accepted finding), outcome: OPEN | IMPROVING | RESOLVED | STRENGTH,
 *   outcomeNote, metricBefore, metricAfter
 * One REPORT item per cycle keeps the dates: reportReceived, rebuttalDue, rebuttalSent, decisionReceived.
 */
export const POSITIONS: [string, string][] = [["ACCEPT", "Accept"], ["PARTIAL", "Partially accept"], ["REBUT", "Rebut"]];
export const DECISIONS: [string, string][] = [["PENDING", "Awaiting council"], ["ACCEPTED", "Rebuttal accepted (finding withdrawn)"], ["PARTLY", "Partly accepted (finding softened)"], ["REJECTED", "Rebuttal rejected (finding stands)"]];
export const OUTCOMES: [string, string][] = [["OPEN", "Not started"], ["IMPROVING", "Improving"], ["RESOLVED", "Resolved"], ["STRENGTH", "Now a strength"]];

export type Evidence = { name: string; url: string };
export type Progress = { on: string; pct: number; note: string; by: string };

export function parseFinding(i: { dataJson: string; status: string }) {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(i.dataJson); } catch { raw = {}; }
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []) as Evidence[];
  const progress = (Array.isArray(raw.progress) ? raw.progress : []) as Progress[];
  const type = str("type");
  const position = str("position");
  const decision = str("decision") || (position === "REBUT" || position === "PARTIAL" ? "PENDING" : "");
  // A finding is withdrawn when the council accepted our rebuttal; it then needs no corrective action.
  const withdrawn = position === "REBUT" && decision === "ACCEPTED";
  const needsAction = type !== "STRENGTH" && type !== "" && !withdrawn;
  const pct = progress.length ? Math.max(0, Math.min(100, Number(progress.at(-1)?.pct) || 0)) : i.status === "DONE" ? 100 : 0;
  const outcome = str("outcome") || (i.status === "DONE" ? "RESOLVED" : progress.length ? "IMPROVING" : "OPEN");
  return { raw, type, position, decision, withdrawn, needsAction, evidence, progress, pct, outcome, rebuttal: str("rebuttal"), decisionNote: str("decisionNote"), outcomeNote: str("outcomeNote"), metricBefore: str("metricBefore"), metricAfter: str("metricAfter") };
}
export const labelOf = (list: [string, string][], k: string) => list.find((x) => x[0] === k)?.[1] || k;
