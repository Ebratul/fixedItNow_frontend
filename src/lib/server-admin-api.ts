import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIES } from "./server-api";

export type AdminRead<T> = { ok: true; data: T } | { ok: false; status: number };

/**
 * Server-side GET of an ADMIN endpoint, for the admin Server Components (dashboard figures, a user's details).
 *
 * - **What is forwarded:** only the visitor's Better Auth session cookie, exactly what the browser would send to
 *   `/api/v1` through the proxy. The backend authenticates it and applies the same permission and realm checks as
 *   for a browser request. Nothing here decides who may see what.
 * - **Never cached** (`no-store`), and called only while rendering this visitor's own response (the admin pages
 *   are dynamic). One administrator's figures are never served to anyone else.
 * - **Failure is a status, not a throw:** 401/403/404 and network errors come back as `{ ok: false, status }` (0 for
 *   no answer). The page shows a message or `notFound()`, and the client shell still decides whether the visitor
 *   is an administrator at all.
 */
export async function serverAdminApi<T>(path: string): Promise<AdminRead<T>> {
  const base = process.env.BACKEND_URL ?? "http://localhost:4000";
  const jar = await cookies();
  const session = SESSION_COOKIES.map((name) => jar.get(name)).find(Boolean);
  if (!session) return { ok: false, status: 401 };
  try {
    const response = await fetch(`${base}/api/v1${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json", Cookie: `${session.name}=${encodeURIComponent(session.value)}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** The message for a failed admin read (the client shell already handles "not signed in"). */
export function adminReadMessage(status: number): string {
  if (status === 403) return "Your role cannot see this information.";
  if (status === 0) return "The service is temporarily unavailable. Reload the page to try again.";
  return "This information could not be loaded. Reload the page to try again.";
}
