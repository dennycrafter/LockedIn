import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Defense in depth for mutating routes: middleware already 401s unauthenticated
// API calls, but each route re-checks the session cookie itself so no route can
// be added that silently relies on middleware having run.
export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token, process.env.SESSION_SECRET, Math.floor(Date.now() / 1000));
}
