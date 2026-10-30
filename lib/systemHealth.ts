import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// System health: compares what the app expects (the Prisma schema it was built with) against the live database, and
// writes ONE safe script that adds whatever is missing. Database updates in this project are hand-run SQL files, so
// this is how anyone can see at a glance whether one was missed. The script only ever ADDS (tables, columns, enum
// values, unique indexes) or relaxes a NOT NULL the app doesn't need — it never drops or rewrites data.

type DField = { name: string; kind: string; type: string; isList: boolean; isRequired: boolean; isId: boolean; isUnique: boolean; isUpdatedAt?: boolean; hasDefaultValue: boolean; default?: unknown; dbName?: string | null };
type DModel = { name: string; dbName: string | null; fields: DField[]; primaryKey: { name: string | null; fields: string[] } | null; uniqueIndexes: { name: string | null; fields: string[] }[] };
type DEnum = { name: string; values: { name: string; dbName: string | null }[]; dbName?: string | null };

export type IssueKind = "MISSING_TABLE" | "MISSING_COLUMN" | "MISSING_ENUM" | "MISSING_ENUM_VALUE" | "MISSING_UNIQUE" | "NOT_NULL" | "TYPE";
export type Issue = { kind: IssueKind; table: string; column?: string; detail: string; sql: string | null; severity: "breaks" | "risk" | "info" };

const SCALAR: Record<string, { sql: string; udt: string }> = {
  String: { sql: "TEXT", udt: "text" }, Int: { sql: "INTEGER", udt: "int4" }, Float: { sql: "DOUBLE PRECISION", udt: "float8" },
  Boolean: { sql: "BOOLEAN", udt: "bool" }, DateTime: { sql: "TIMESTAMP(3)", udt: "timestamp" }, Json: { sql: "JSONB", udt: "jsonb" },
  BigInt: { sql: "BIGINT", udt: "int8" }, Decimal: { sql: "DECIMAL(65,30)", udt: "numeric" }, Bytes: { sql: "BYTEA", udt: "bytea" },
};
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function colType(f: DField) {
  const base = f.kind === "enum" ? q(f.type) : (SCALAR[f.type]?.sql || "TEXT");
  return f.isList ? `${base}[]` : base;
}
function colDefault(f: DField): string | null {
  if (f.isUpdatedAt) return "CURRENT_TIMESTAMP";
  if (!f.hasDefaultValue) return null;
  const d = f.default as unknown;
  if (d && typeof d === "object" && !Array.isArray(d) && "name" in (d as Record<string, unknown>)) {
    const n = (d as { name: string }).name;
    if (n === "now") return "CURRENT_TIMESTAMP";
    return null; // cuid(), uuid(), autoincrement(): filled in by the app, not the database
  }
  const one = (v: unknown) => (typeof v === "string" ? lit(v) : typeof v === "boolean" ? (v ? "true" : "false") : String(v));
  if (Array.isArray(d)) return `ARRAY[${d.map(one).join(", ")}]::${colType(f)}`;
  if (f.kind === "enum" && typeof d === "string") return `${lit(d)}::${q(f.type)}`;
  if (f.type === "Json" && typeof d === "string") return `${lit(d)}::jsonb`;
  return one(d);
}
function columnDef(f: DField, forNewTable: boolean) {
  const def = colDefault(f);
  // A required column added to a table that already has rows can only be NOT NULL when it has a default.
  const notNull = f.isRequired && (forNewTable || def !== null || f.isList);
  return `${q(f.dbName || f.name)} ${colType(f)}${notNull ? " NOT NULL" : ""}${def !== null ? ` DEFAULT ${def}` : f.isList && f.isRequired ? ` DEFAULT ARRAY[]::${colType(f)}` : ""}`;
}

export async function checkDatabase() {
  const dm = (Prisma as unknown as { dmmf: { datamodel: { models: DModel[]; enums: DEnum[] } } }).dmmf.datamodel;
  const t0 = Date.now();
  const [cols, enums, idx] = await Promise.all([
    prisma.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string; udt_name: string; data_type: string }[]>(
      `SELECT table_name, column_name, is_nullable, udt_name, data_type FROM information_schema.columns WHERE table_schema = current_schema()`),
    prisma.$queryRawUnsafe<{ typname: string; enumlabel: string }[]>(
      `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema()`),
    prisma.$queryRawUnsafe<{ tablename: string; indexname: string; indexdef: string }[]>(
      `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()`),
  ]);
  const ms = Date.now() - t0;
  const table = new Map<string, Map<string, { nullable: boolean; udt: string }>>();
  for (const c of cols) {
    const m = table.get(c.table_name) || new Map();
    m.set(c.column_name, { nullable: c.is_nullable === "YES", udt: c.udt_name });
    table.set(c.table_name, m);
  }
  const enumVals = new Map<string, Set<string>>();
  for (const e of enums) { const s = enumVals.get(e.typname) || new Set<string>(); s.add(e.enumlabel); enumVals.set(e.typname, s); }
  // Unique indexes by table: the column list, so a differently named but equivalent index still counts.
  const uniq = new Map<string, string[]>();
  for (const i of idx) {
    if (!/UNIQUE/i.test(i.indexdef) && !i.indexname.endsWith("_pkey")) continue;
    const m = i.indexdef.match(/\(([^)]*)\)\s*$/);
    const key = m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).join(",") : i.indexname;
    uniq.set(i.tablename, [...(uniq.get(i.tablename) || []), key]);
  }

  const issues: Issue[] = [];
  for (const e of dm.enums) {
    const name = e.dbName || e.name;
    const have = enumVals.get(name);
    if (!have) {
      issues.push({ kind: "MISSING_ENUM", table: name, detail: `Type ${name} is missing`, severity: "breaks",
        sql: `DO $$ BEGIN CREATE TYPE ${q(name)} AS ENUM (${e.values.map((v) => lit(v.dbName || v.name)).join(", ")}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;` });
      continue;
    }
    for (const v of e.values) {
      const val = v.dbName || v.name;
      if (!have.has(val)) issues.push({ kind: "MISSING_ENUM_VALUE", table: name, column: val, detail: `${name} has no value ${val} — saving it fails`, severity: "breaks", sql: `ALTER TYPE ${q(name)} ADD VALUE IF NOT EXISTS ${lit(val)};` });
    }
  }

  let checkedTables = 0, checkedColumns = 0;
  for (const m of dm.models) {
    const name = m.dbName || m.name;
    const scalars = m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
    const have = table.get(name);
    checkedTables++; checkedColumns += scalars.length;
    if (!have) {
      const pk = m.primaryKey ? m.primaryKey.fields : scalars.filter((f) => f.isId).map((f) => f.name);
      const lines = scalars.map((f) => `  ${columnDef(f, true)}`);
      if (pk.length) lines.push(`  CONSTRAINT ${q(`${name}_pkey`)} PRIMARY KEY (${pk.map(q).join(", ")})`);
      const extra = [
        ...scalars.filter((f) => f.isUnique && !f.isId).map((f) => `CREATE UNIQUE INDEX IF NOT EXISTS ${q(`${name}_${f.name}_key`)} ON ${q(name)}(${q(f.name)});`),
        ...m.uniqueIndexes.map((u) => `CREATE UNIQUE INDEX IF NOT EXISTS ${q(u.name || `${name}_${u.fields.join("_")}_key`)} ON ${q(name)}(${u.fields.map(q).join(", ")});`),
      ];
      issues.push({ kind: "MISSING_TABLE", table: name, detail: `Table ${name} is missing — every page that uses it fails or shows "run the migration"`, severity: "breaks",
        sql: `CREATE TABLE IF NOT EXISTS ${q(name)} (\n${lines.join(",\n")}\n);${extra.length ? "\n" + extra.join("\n") : ""}` });
      continue;
    }
    for (const f of scalars) {
      const col = f.dbName || f.name;
      const c = have.get(col);
      if (!c) {
        const def = colDefault(f);
        const partial = f.isRequired && def === null && !f.isList;
        issues.push({ kind: "MISSING_COLUMN", table: name, column: col, detail: `${name}.${col} is missing${partial ? " (added without NOT NULL: existing rows have no value for it)" : ""}`, severity: "breaks",
          sql: `ALTER TABLE ${q(name)} ADD COLUMN IF NOT EXISTS ${columnDef(f, false)};` });
        continue;
      }
      if (!f.isRequired && !c.nullable && !f.isId) {
        issues.push({ kind: "NOT_NULL", table: name, column: col, detail: `${name}.${col} is NOT NULL in the database but optional in the app — saving a blank value fails`, severity: "risk",
          sql: `ALTER TABLE ${q(name)} ALTER COLUMN ${q(col)} DROP NOT NULL;` });
      }
      const want = f.kind === "enum" ? f.type : SCALAR[f.type]?.udt;
      const isListDb = c.udt.startsWith("_");
      const got = c.udt.replace(/^_/, "");
      const same = got === want || (want === "text" && got === "varchar") || (want === "timestamp" && got === "timestamptz") || (want === "jsonb" && got === "json");
      if (want && f.isList !== isListDb) {
        issues.push({ kind: "TYPE", table: name, column: col, detail: `${name}.${col} is ${isListDb ? "a list" : "a single value"} in the database, the app expects ${f.isList ? "a list" : "a single value"}`, severity: "risk", sql: null });
      } else if (want && !same) {
        issues.push({ kind: "TYPE", table: name, column: col, detail: `${name}.${col} is ${got} in the database, the app expects ${want}`, severity: "risk", sql: null });
      }
    }
    // Unique rules the app relies on (upserts by these fields fail without them).
    const keys = new Set(uniq.get(name) || []);
    const wanted = [
      ...scalars.filter((f) => f.isUnique && !f.isId).map((f) => ({ name: `${name}_${f.name}_key`, fields: [f.name] })),
      ...m.uniqueIndexes.map((u) => ({ name: u.name || `${name}_${u.fields.join("_")}_key`, fields: u.fields })),
    ];
    for (const u of wanted) {
      if (keys.has(u.fields.join(","))) continue;
      if (u.fields.some((x) => !have.has(x))) continue; // the missing column is reported (and added) first; re-check after
      issues.push({ kind: "MISSING_UNIQUE", table: name, column: u.fields.join(", "), detail: `${name} has no unique rule on (${u.fields.join(", ")}) — saving by it fails and duplicates can creep in`, severity: "risk",
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS ${q(u.name)} ON ${q(name)}(${u.fields.map(q).join(", ")});` });
    }
  }
  return { issues, checkedTables, checkedColumns, checkedEnums: dm.enums.length, ms };
}

/** One script with every fix, in a safe order. It can be run more than once. */
export function fixScript(issues: Issue[]) {
  const order: IssueKind[] = ["MISSING_ENUM", "MISSING_ENUM_VALUE", "MISSING_TABLE", "MISSING_COLUMN", "NOT_NULL", "MISSING_UNIQUE"];
  const parts = order.flatMap((k) => issues.filter((i) => i.kind === k && i.sql).map((i) => `-- ${i.detail}\n${i.sql}`));
  if (!parts.length) return "";
  return `-- System Health fix script, made ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.\n-- Only adds what is missing; nothing is dropped or overwritten. Safe to run more than once.\n-- Note: a unique rule can fail if duplicate rows already exist; the error names the table.\n\n${parts.join("\n\n")}\n\nSELECT 'done' AS result;\n`;
}

/** Host, port and options of the database connection (never the password), and where this server runs. */
function dbUrlInfo() {
  try {
    const u = new URL(process.env.DATABASE_URL || "");
    const pooled = u.port === "6543" && u.searchParams.get("pgbouncer") === "true";
    return `Host ${u.hostname}, port ${u.port || "5432"}${u.search ? `, options ${u.search.slice(1)}` : ", no options"}. ${pooled ? "Pooled connection: good." : "Not using the pooler (port 6543 with ?pgbouncer=true&connection_limit=1) — slower and can run out of connections."} Server region: ${process.env.VERCEL_REGION || "unknown"}.`;
  } catch { return ""; }
}

/** Settings the app reads from Vercel. Only whether each is set — never the value. */
export function settingsCheck() {
  const has = (k: string) => !!process.env[k];
  return [
    { key: "DATABASE_URL", set: has("DATABASE_URL"), need: "required", what: `The database connection. ${dbUrlInfo()}` },
    { key: "CRON_SECRET", set: has("CRON_SECRET"), need: "required", what: "Without it the daily job (deadline reminders, sign-in watch) refuses to run." },
    { key: "RESEND_API_KEY", set: has("RESEND_API_KEY"), need: "optional", what: "Email delivery. Without it, notifications stay inside the app." },
    { key: "EMAIL_FROM", set: has("EMAIL_FROM"), need: "optional", what: "The sender address for emails (needed together with RESEND_API_KEY)." },
    { key: "NEXT_PUBLIC_APP_URL", set: has("NEXT_PUBLIC_APP_URL") || has("VERCEL_PROJECT_PRODUCTION_URL"), need: "optional", what: "The app's address, used for links inside emails." },
    { key: "SENTRY_DSN", set: has("SENTRY_DSN"), need: "optional", what: "Error monitoring (Sentry). Without it errors are only in the Vercel logs and System Feedback." },
    { key: "SENTRY_TRACES_SAMPLE_RATE", set: has("SENTRY_TRACES_SAMPLE_RATE"), need: "optional", what: "Share of requests traced for speed in Sentry (default 0.1 = 10%)." },
    { key: "SUPPORT_EMAIL", set: has("SUPPORT_EMAIL"), need: "optional", what: "Where 'Report a problem' emails go when the automatic report can't be sent." },
  ];
}
