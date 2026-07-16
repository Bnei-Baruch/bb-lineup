import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Pages any logged-in user may open (readonly tier): the weekly list, the day grid,
// the broadcast day-view pages (but never their /edit siblings), and the fixed
// /today (/today/1, /today/2, ...) broadcast-display redirect links.
const READONLY_PATTERNS = [
  /^\/lineup$/,
  /^\/lineup\/[^/]+$/,
  /^\/lineup\/[^/]+\/day\/[^/]+$/,
  /^\/lineup\/[^/]+\/day\/[^/]+\/(?!edit$)[^/]+$/,
  /^\/today$/,
  /^\/today\/[^/]+$/,
];

function isReadonlyOk(pathname: string): boolean {
  return READONLY_PATTERNS.some((re) => re.test(pathname));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/signin") return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Any authenticated user gets readonly access; lineup_admin is required for everything else.
  const isAdmin = (req.auth.user?.roles ?? []).includes("lineup_admin");

  if (isAdmin || isReadonlyOk(pathname)) return NextResponse.next();

  return NextResponse.redirect(new URL("/lineup", req.nextUrl.origin));
});

export const config = {
  matcher: ["/((?!api/auth|api/playout/current|_next/static|_next/image|favicon.ico).*)"],
};
