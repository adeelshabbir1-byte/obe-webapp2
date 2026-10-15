import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// Buildings, rooms and campus services — the physical facilities accreditation visits (PEC, NCEAC, NBEAC) ask about.
// The Facilities Manager (and the Institute Head) keep them; deans, chairmen and program leads can look.

export const ROOM_TYPES: Record<string, string> = {
  CLASSROOM: "Classroom", LECTURE_HALL: "Lecture hall", LAB: "Laboratory", AUDITORIUM: "Auditorium / hall", SEMINAR: "Seminar room",
  CONFERENCE: "Conference / meeting room", FACULTY_OFFICE: "Faculty office", LIBRARY: "Library / reading room", ADMIN: "Administration office",
  COMMON_ROOM: "Common room", WASHROOM: "Washroom", STORE: "Store", OTHER: "Other",
};
/** Each service with what its numbers mean (quantity / capacity / staff). */
export const SERVICE_KINDS: Record<string, { label: string; quantity?: string; capacity?: string; staff?: string; hint: string }> = {
  HOSTEL: { label: "Hostel", quantity: "Rooms", capacity: "Beds", staff: "Wardens / staff", hint: "Boys / girls, location, mess, rules" },
  TRANSPORT: { label: "Transport", quantity: "Vehicles", capacity: "Seats", staff: "Drivers", hint: "Routes, timings, fee" },
  DISPENSARY: { label: "Dispensary / medical", quantity: "Beds", staff: "Doctors / nurses", hint: "Timings, first aid, ambulance, panel hospital" },
  CAFETERIA: { label: "Cafeteria", quantity: "Outlets", capacity: "Seats", hint: "Timings, hygiene inspection" },
  SPORTS: { label: "Sports facilities", quantity: "Grounds / courts", capacity: "Gym capacity", hint: "Cricket, football, badminton, gym, indoor games" },
  PRAYER: { label: "Prayer area / mosque", capacity: "Capacity", hint: "Separate areas for men and women" },
  PARKING: { label: "Parking", capacity: "Vehicles", hint: "Staff / student / visitor parking" },
  POWER_BACKUP: { label: "Power backup", quantity: "Generators / UPS", capacity: "Total kVA", hint: "Solar, generators, UPS for labs" },
  INTERNET: { label: "Internet / Wi-Fi", capacity: "Bandwidth (Mbps)", quantity: "Access points", hint: "Coverage, provider, backup link" },
  SECURITY: { label: "Security", quantity: "CCTV cameras", staff: "Guards", hint: "Gates, ID cards, visitor control" },
  FIRE_SAFETY: { label: "Fire safety", quantity: "Extinguishers", hint: "Alarms, exits, last drill" },
  ACCESSIBILITY: { label: "Accessibility", quantity: "Ramps / lifts", hint: "Wheelchair access, accessible washrooms" },
  DAY_CARE: { label: "Day care", capacity: "Children", staff: "Staff", hint: "For faculty and staff" },
  BANK: { label: "Bank / ATM", quantity: "ATMs", hint: "Fee collection branch" },
  BOOKSHOP: { label: "Bookshop / photocopy", quantity: "Outlets", hint: "" },
  OTHER: { label: "Other", quantity: "Quantity", capacity: "Capacity", staff: "Staff", hint: "" },
};
export const OWNERSHIP: Record<string, string> = { OWNED: "Owned", RENTED: "Rented", LEASED: "Leased" };
export const VIEW_ROLES = ["FACILITIES_MANAGER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC", "LAB_MANAGER"];

type Who = { id: string; role: string; managedById: string | null };
export async function facilitiesScope(user: Who) {
  if (!VIEW_ROLES.includes(user.role)) return null;
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  if (!chairmanId) return null;
  return { chairmanId, canEdit: user.role === "FACILITIES_MANAGER" || user.role === "CHAIRMAN" };
}

export const roomArea = (r: { lengthFt: number | null; widthFt: number | null }) => (r.lengthFt && r.widthFt ? Math.round(r.lengthFt * r.widthFt) : null);

export async function loadFacilities(chairmanId: string) {
  const [buildings, rooms, services, labs, library, students, faculty] = await Promise.all([
    prisma.facilityBuilding.findMany({ where: { chairmanId }, orderBy: { name: "asc" } }),
    prisma.facilityRoom.findMany({ where: { chairmanId }, orderBy: [{ roomType: "asc" }, { name: "asc" }] }),
    prisma.facilityService.findMany({ where: { chairmanId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.labInfo.findMany({ where: { chairmanId }, select: { seats: true, computers: true } }),
    prisma.libraryInfo.findUnique({ where: { chairmanId }, select: { seats: true, totalTitles: true } }),
    prisma.student.count({ where: { batch: { coordinator: { managedById: chairmanId } } } }),
    prisma.user.count({ where: { isActive: true, isVisitingPlaceholder: false, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }], role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN"] as never } } }),
  ]);
  return { buildings, rooms, services, labs, library, students, faculty };
}

export function summarize(d: Awaited<ReturnType<typeof loadFacilities>>) {
  const sum = (xs: (number | null)[]) => xs.reduce<number>((n, x) => n + (x || 0), 0);
  const ofType = (t: string) => d.rooms.filter((r) => r.roomType === t);
  const classrooms = [...ofType("CLASSROOM"), ...ofType("LECTURE_HALL")];
  const classroomSeats = sum(classrooms.map((r) => r.capacity));
  const classroomArea = sum(classrooms.map(roomArea));
  return {
    totalArea: sum(d.buildings.map((b) => b.totalAreaSqft)), coveredArea: sum(d.buildings.map((b) => b.coveredAreaSqft)),
    buildings: d.buildings.length, rooms: d.rooms.length,
    classrooms: classrooms.length, classroomSeats, multimediaClassrooms: classrooms.filter((r) => r.multimedia).length,
    areaPerSeat: classroomSeats && classroomArea ? Math.round((classroomArea / classroomSeats) * 10) / 10 : null,
    labsRecorded: ofType("LAB").length + d.labs.length, labSeats: sum(ofType("LAB").map((r) => r.capacity)) + sum(d.labs.map((l) => l.seats)),
    facultyOffices: ofType("FACULTY_OFFICE").length, faculty: d.faculty,
    auditoriumSeats: sum(ofType("AUDITORIUM").map((r) => r.capacity)),
    seminarRooms: ofType("SEMINAR").length + ofType("CONFERENCE").length,
    students: d.students,
    hostelBeds: sum(d.services.filter((s) => s.kind === "HOSTEL" && s.available).map((s) => s.capacity)),
    transportSeats: sum(d.services.filter((s) => s.kind === "TRANSPORT" && s.available).map((s) => s.capacity)),
  };
}

/** What a facilities inspection usually asks to see, and whether it is recorded here. No thresholds are claimed. */
export function checklist(d: Awaited<ReturnType<typeof loadFacilities>>, s: ReturnType<typeof summarize>) {
  const has = (kind: string) => d.services.some((x) => x.kind === kind && x.available);
  return [
    { label: "Land and covered area of every building", ok: d.buildings.length > 0 && d.buildings.every((b) => b.totalAreaSqft && b.coveredAreaSqft) },
    { label: "Classrooms with dimensions and seating capacity", ok: s.classrooms > 0 && d.rooms.filter((r) => r.roomType === "CLASSROOM" || r.roomType === "LECTURE_HALL").every((r) => r.capacity && r.lengthFt && r.widthFt) },
    { label: "Multimedia in classrooms", ok: s.classrooms > 0 && s.multimediaClassrooms === s.classrooms, note: `${s.multimediaClassrooms} of ${s.classrooms}` },
    { label: "Laboratories (rooms here or in Lab Inventory)", ok: s.labsRecorded > 0 },
    { label: "Faculty offices", ok: s.facultyOffices > 0, note: `${s.facultyOffices} offices for ${s.faculty} faculty members` },
    { label: "Library / reading room", ok: !!d.library || d.rooms.some((r) => r.roomType === "LIBRARY") },
    { label: "Seminar or conference room", ok: s.seminarRooms > 0 },
    { label: "Auditorium or multipurpose hall", ok: s.auditoriumSeats > 0 },
    { label: "Dispensary / medical cover", ok: has("DISPENSARY") },
    { label: "Transport", ok: has("TRANSPORT") },
    { label: "Hostel", ok: has("HOSTEL") },
    { label: "Cafeteria", ok: has("CAFETERIA") },
    { label: "Sports facilities", ok: has("SPORTS") },
    { label: "Prayer area", ok: has("PRAYER") },
    { label: "Power backup", ok: has("POWER_BACKUP") },
    { label: "Internet / Wi-Fi", ok: has("INTERNET") },
    { label: "Security", ok: has("SECURITY") },
    { label: "Fire safety", ok: has("FIRE_SAFETY") },
    { label: "Accessibility for disabled persons", ok: has("ACCESSIBILITY") },
  ];
}
