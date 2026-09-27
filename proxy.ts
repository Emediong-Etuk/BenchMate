import { NextResponse, type NextRequest } from "next/server";
import { PASS_COOKIE, verifyPass } from "@/lib/server/passcode";

// Optional demo passcode gate (brief §15). With DEMO_PASSCODE unset this is a
// no-op. Pages redirect to /passcode; API routes answer 401.

export async function proxy(request: NextRequest) {
  const secret = process.env.DEMO_PASSCODE;
  if (!secret) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/passcode" || pathname === "/api/passcode") return NextResponse.next();

  if (await verifyPass(secret, request.cookies.get(PASS_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Enter the demo passcode first." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/passcode";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except static assets and files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|worklets/).*)"],
};
