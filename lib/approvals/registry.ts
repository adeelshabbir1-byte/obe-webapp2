import { NextRequest } from "next/server";
import type { Who } from "../registers";

// The approvals inbox is a registry: each module registers a provider that lists what is waiting for a person and,
// where the module allows it, approves or returns an item. A new module plugs in by calling register() — the inbox
// page and its API never change. Decisions go through the module's own API route (internally), so the module's own
// checks, audit log and notifications run exactly as when the person decides on the module's page.

export type Action = "approve" | "return";
export type SessionUser = { id: string; name: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null; extraRoles?: string[] | null };
export type Ctx = { user: SessionUser; w: Who };
export type Item = {
  kind: string; id: string; title: string; from: string; area: string; since: Date; due: Date | null;
  priority: "high" | "normal" | "low"; href: string; actions: Action[]; onBehalfOf?: string; note?: string;
};
export type Provider = {
  kind: string; label: string;
  /** Safe to approve many at once (no judgement per item needed). */
  bulk?: boolean;
  /** Who is reminded / escalated about it: the module decides by position, so delegates and the resolver apply. */
  byPosition?: boolean;
  fetch(ctx: Ctx): Promise<Item[]>;
  act?(ctx: Ctx, id: string, action: Action, reason: string, req: Request): Promise<{ ok: boolean; error?: string }>;
};

const providers = new Map<string, Provider>();
export function register(p: Provider) { providers.set(p.kind, p); }
export function allProviders() { return Array.from(providers.values()); }
export function providerOf(kind: string) { return providers.get(kind) || null; }

/** Call a module's API route handler from the server, as the signed-in person (their session cookie goes along). */
export async function callRoute(handler: (req: NextRequest, ctx?: any) => Promise<Response>, req: Request, path: string, body: unknown, params?: Record<string, string>, method = "POST") {
  const r = new NextRequest(new URL(path, req.url), { method, headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" }, body: JSON.stringify(body) });
  const res = params ? await handler(r, { params }) : await handler(r);
  const d = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: (d as { error?: string }).error || `The module refused (${res.status}).` };
}
export const daysSince = (d: Date | string) => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
