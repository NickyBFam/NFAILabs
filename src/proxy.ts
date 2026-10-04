import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminAuthCookieOptions, readAuthConfig } from "@/lib/auth/config";
import { isAdminAuthPath, isProtectedAdminPath, signInPathFor } from "@/lib/auth/routes";
import { verifyUser } from "@/lib/auth/verify";

/**
 * Next.js 16 proxy (formerly middleware) for the admin area. It is a first gate, not
 * the authorization check (docs/ADMIN.md §1):
 *
 *   1. It verifies the session with Supabase Auth (getUser), refreshing an expiring
 *      access token and writing the new cookies before any page renders (Server
 *      Components cannot write cookies).
 *   2. It sends requests with no valid session to sign-in, keeping the requested page.
 *   3. It marks every admin response private, uncacheable and noindex.
 *
 * Admin identity and permissions are checked by every page and action through
 * `requireAdmin()` and the database functions. If auth is not configured or Supabase
 * Auth cannot be reached, protected pages are refused (fail closed).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });

  const finish = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
    result.headers.set("X-Robots-Tag", "noindex, nofollow");
    return result;
  };
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any cookie changes (refreshed or cleared session) on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return finish(redirect);
  };

  const config = readAuthConfig();
  if (!config) {
    return isProtectedAdminPath(pathname)
      ? redirectTo(signInPathFor(null, "unavailable"))
      : finish(response);
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookieOptions: adminAuthCookieOptions(),
    auth: { detectSessionInUrl: false },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const user = await verifyUser(supabase);

  if (isAdminAuthPath(pathname) || !isProtectedAdminPath(pathname)) return finish(response);
  if (user.status === "signed_in") return finish(response);
  if (user.status === "error") return redirectTo(signInPathFor(null, "unavailable"));
  return redirectTo(signInPathFor(`${pathname}${search}`));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
