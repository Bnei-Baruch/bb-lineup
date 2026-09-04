import { NextRequest, NextResponse } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-token",
};

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  if (MUTATING_METHODS.has(request.method)) {
    const token = request.headers.get("x-api-token");
    if (token !== process.env.NEXT_PUBLIC_API_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
