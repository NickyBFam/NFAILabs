/**
 * Admin route constants and redirect rules. Pure and browser-safe: no secrets,
 * no server APIs, so Client Components and the proxy can import it.
 */

export const ADMIN_ROOT_PATH = "/admin";
export const ADMIN_AUTH_PATH = "/admin/auth";
export const ADMIN_SIGN_IN_PATH = "/admin/auth/sign-in";
export const ADMIN_SIGN_OUT_PATH = "/admin/auth/sign-out";
export const ADMIN_UNAUTHORIZED_PATH = "/admin/auth/unauthorized";

/** Query parameter carrying the admin page to return to after signing in. */
export const NEXT_PARAM = "next";

/** Query parameter explaining why the sign-in page is shown. */
export const SIGN_IN_NOTICE_PARAM = "notice";
export type SignInNotice = "signed_out" | "expired" | "unavailable";

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Sign-in, sign-out and unauthorized pages: reachable without an admin session. */
export function isAdminAuthPath(pathname: string): boolean {
  return isUnder(pathname, ADMIN_AUTH_PATH);
}

/** Every other /admin path requires a signed-in, active admin identity. */
export function isProtectedAdminPath(pathname: string): boolean {
  return isUnder(pathname, ADMIN_ROOT_PATH) && !isAdminAuthPath(pathname);
}

/**
 * Where to send the user after signing in. Only same-origin admin pages are allowed,
 * so a crafted `next` value can never redirect off-site (open redirect) or back into
 * the auth pages. Anything else falls back to the admin home.
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return ADMIN_ROOT_PATH;
  // Reject protocol-relative, backslash and control-character tricks before parsing.
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) {
    return ADMIN_ROOT_PATH;
  }
  let url: URL;
  try {
    url = new URL(next, "http://admin.invalid");
  } catch {
    return ADMIN_ROOT_PATH;
  }
  if (url.origin !== "http://admin.invalid" || !isProtectedAdminPath(url.pathname)) {
    return ADMIN_ROOT_PATH;
  }
  return `${url.pathname}${url.search}`;
}

/** Sign-in URL that returns to `next` afterwards (when it is a safe admin path). */
export function signInPathFor(next?: string | null, notice?: SignInNotice): string {
  const params = new URLSearchParams();
  const target = safeAdminRedirect(next);
  if (target !== ADMIN_ROOT_PATH) params.set(NEXT_PARAM, target);
  if (notice) params.set(SIGN_IN_NOTICE_PARAM, notice);
  const query = params.toString();
  return query ? `${ADMIN_SIGN_IN_PATH}?${query}` : ADMIN_SIGN_IN_PATH;
}
