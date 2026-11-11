import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthorized, passcodeEnabled } from "@/lib/auth";

/**
 * Locks the whole app behind APP_PASSCODE (when set): pages redirect to
 * /login, API calls and photos get 401. The login page and its API stay open.
 */
export async function proxy(request: NextRequest) {
  if (!passcodeEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();

  if (await isAuthorized(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/") || pathname.startsWith("/argie/")) {
    return NextResponse.json({ error: "Locked. Enter your passcode first." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next.js build assets and the app icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
