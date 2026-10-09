import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifyPassword } from "@/lib/auth";
import { loginRateLimiter } from "@/lib/rate-limit";

// Client IP for the in-memory limiter. Vercel provides x-forwarded-for.
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

function tooMany(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minutes.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  // A blocked IP gets 429 before the password is even checked.
  const gate = loginRateLimiter.check(ip);
  if (!gate.allowed) return tooMany(gate.retryAfterSeconds ?? 600);

  let password: unknown;
  try {
    const body = (await request.json()) as { password?: unknown };
    password = body.password;
  } catch {
    password = undefined; // malformed body counts as a wrong attempt
  }

  const ok =
    typeof password === "string" && (await verifyPassword(password, process.env.APP_PASSWORD));

  if (!ok) {
    const verdict = loginRateLimiter.recordFailure(ip);
    if (!verdict.allowed) return tooMany(verdict.retryAfterSeconds ?? 600);
    return NextResponse.json({ error: "Wrong password. Try again." }, { status: 401 });
  }

  loginRateLimiter.recordSuccess(ip);

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server is missing SESSION_SECRET. Set it and deploy again." },
      { status: 500 },
    );
  }

  const expiryUnix = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signSessionToken(secret, expiryUnix);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return response;
}
