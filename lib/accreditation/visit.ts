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
    { day: "Day 1", time: "09:45", session: "Program presentation: mission, PEOs, PLOs, assessment and CQI", with: "Program Lead, faculty", venue: "Board room" },
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
