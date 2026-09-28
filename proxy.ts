import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

// Sign-in gate. Home, About and the sign-in page are public; every other page
// redirects to /signin, and every API route (except Auth.js's own) answers
// 401. Routes check the user again themselves.

const PUBLIC_PAGES = new Set(["/", "/about", "/signin"]);

const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();
  const signedIn = Boolean(req.auth?.user);

  if (pathname === "/signin" && signedIn) return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  if (PUBLIC_PAGES.has(pathname) || signedIn) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL("/signin", req.nextUrl);
  url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
});

export const config = {
  // Everything except static assets and files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|worklets/).*)"],
};
