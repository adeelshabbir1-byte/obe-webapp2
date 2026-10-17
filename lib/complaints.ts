import { prisma } from "./db";
export const cmdb = prisma as unknown as Record<string, any>;
export const CATEGORIES = ["Academic (teaching, grading)", "Examination", "Fee / finance", "Hostel / transport", "Facilities / labs / library", "Harassment / misconduct", "Administration", "Other"];
export const HANDLERS = ["CHAIRMAN", "STUDENT_AFFAIRS", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR"];
export type Complaint = { id: string; byStudentId: string | null; byUserId: string | null; anonymous: boolean; category: string; subject: string; details: string; status: string; assignedToId: string | null; resolution: string | null; createdAt: Date; closedAt: Date | null };
export const STATUS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", REJECTED: "Not upheld" };
