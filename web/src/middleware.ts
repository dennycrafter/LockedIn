import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false; // fail closed when the secret is not configured
  const nowUnix = Math.floor(Date.now() / 1000);
  return verifySessionToken(token, secret, nowUnix);
}

// SPEC 8.1: pages redirect to /login, API routes return 401.
export async function middleware(request: NextRequest) {
  if (await hasValidSession(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Protect everything except the login page, the login API, the cron route
  // and static assets (SPEC 8.1 exemptions).
  matcher: [
    "/((?!login(?:/|$)|api/login(?:/|$)|api/cron/keepalive(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
