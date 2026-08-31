-- ============================================================================
-- Row-Level Security for tenant isolation (spec section 3)
--
-- Pattern: every tenant-scoped table gets RLS enabled, and a policy that
-- compares the row's institution_id against a per-request session variable,
-- 'app.current_institution_id'. The application sets this variable at the
-- start of every request (see lib/db.ts pattern referenced in the API routes).
--
-- This means even if application code forgets a WHERE clause, or a bug slips
-- through code review, the database itself will not return or allow writes
-- to rows belonging to another institution.
--
-- Super User cross-tenant access is handled via a SEPARATE, explicitly
-- audited bypass role/policy — never a blanket disable of RLS.
-- ============================================================================

-- Enable RLS on every tenant-scoped table
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstitutionalCurriculum" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CLO" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PLO" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lecture" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseFacultyAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner role (important: otherwise superuser-owned
-- connections silently bypass RLS)
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Program" FORCE ROW LEVEL SECURITY;
ALTER TABLE "InstitutionalCurriculum" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Course" FORCE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

-- Direct-institution-id tables: straightforward policy
CREATE POLICY tenant_isolation_department ON "Department"
  USING (institution_id = current_setting('app.current_institution_id', true)::text);

CREATE POLICY tenant_isolation_user ON "User"
  USING (
    institution_id = current_setting('app.current_institution_id', true)::text
    OR current_setting('app.is_super_user', true)::boolean = true
  );

CREATE POLICY tenant_isolation_auditlog ON "AuditLog"
  USING (
    institution_id = current_setting('app.current_institution_id', true)::text
    OR current_setting('app.is_super_user', true)::boolean = true
  );

-- Indirect tables (scoped through a join to a tenant-scoped parent): use a
-- subquery against the parent's institution_id. Example for Program (scoped
-- through Department):
CREATE POLICY tenant_isolation_program ON "Program"
  USING (
    department_id IN (
      SELECT id FROM "Department"
      WHERE institution_id = current_setting('app.current_institution_id', true)::text
    )
  );

-- Course is scoped through InstitutionalCurriculum -> Institution
CREATE POLICY tenant_isolation_institutional_curriculum ON "InstitutionalCurriculum"
  USING (institution_id = current_setting('app.current_institution_id', true)::text);

CREATE POLICY tenant_isolation_course ON "Course"
  USING (
    institutional_curriculum_id IN (
      SELECT id FROM "InstitutionalCurriculum"
      WHERE institution_id = current_setting('app.current_institution_id', true)::text
    )
  );

CREATE POLICY tenant_isolation_clo ON "CLO"
  USING (
    course_id IN (
      SELECT c.id FROM "Course" c
      JOIN "InstitutionalCurriculum" ic ON ic.id = c.institutional_curriculum_id
      WHERE ic.institution_id = current_setting('app.current_institution_id', true)::text
    )
  );

-- ============================================================================
-- Super User cross-tenant access
--
-- Rather than disabling RLS for a "superuser" DB role (dangerous — easy to
-- misuse or misconfigure), Super User requests explicitly set:
--   app.is_super_user = true
-- for the duration of a single authorized, audited operation (e.g. institution
-- cloning). Policies above check this flag explicitly. Every request that sets
-- this flag MUST write a corresponding AuditLog row (see lib/audit.ts).
-- ============================================================================

-- MasterCurriculum / MasterCourse are NOT institution-scoped (they belong to
-- the Super User's central library) — RLS is not applied to those tables;
-- write access is instead restricted at the application/API-authorization
-- layer to SUPER_USER role only.
