// The NCEAC readiness limits by default — kept in a module with no imports, so the council standards
// (lib/accreditation/bodies.ts) and the readiness report (lib/readiness.ts) can both use them without a load-order loop.
export type ReadinessStandards = { minCreditHours: number; maxStudentsPerComputer: number; minFullTimeFaculty: number; minPhdFaculty: number; maxFacultyLoadCh: number; maxClassSize: number };
export const NCEAC_DEFAULTS: ReadinessStandards = { minCreditHours: 130, maxStudentsPerComputer: 3, minFullTimeFaculty: 7, minPhdFaculty: 1, maxFacultyLoadCh: 9, maxClassSize: 50 };
