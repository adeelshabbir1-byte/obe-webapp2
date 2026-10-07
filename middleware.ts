import { NextRequest, NextResponse } from "next/server";

// Passes the request path along so the sign-in check can tell which part of the app a request is for
// (a department Program Coordinator may only use certain pages while working on a program).
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
