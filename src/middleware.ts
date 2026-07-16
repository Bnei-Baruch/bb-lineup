import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Pages a lineup_viewer (readonly) may open: the weekly list, the day grid,
// and the broadcast day-view pages — but never their /edit siblings.
const READONLY_PATTERNS = [
  /^\/lineup$/,
  /^\/lineup\/[^/]+$/,
  /^\/lineup\/[^/]+\/day\/[^/]+$/,
  /^\/lineup\/[^/]+\/day\/[^/]+\/(?!edit$)[^/]+$/,
];

function isReadonlyOk(pathname: string): boolean {
  return READONLY_PATTERNS.some((re) => re.test(pathname));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/signin") return NextResponse.next();

  const roles = req.auth?.user?.roles ?? [];
  const isAdmin = roles.includes("lineup_admin");
  const isViewer = roles.includes("lineup_viewer");

  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isReadonlyOk(pathname)) {
    if (isAdmin || isViewer) return NextResponse.next();
    return NextResponse.redirect(new URL("/signin", req.nextUrl.origin));
  }

  if (isAdmin) return NextResponse.next();
  if (isViewer) return NextResponse.redirect(new URL("/lineup", req.nextUrl.origin));
  return NextResponse.redirect(new URL("/signin", req.nextUrl.origin));
});

export const config = {
  matcher: ["/((?!api/auth|api/playout/current|_next/static|_next/image|favicon.ico).*)"],
};
