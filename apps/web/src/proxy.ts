import {getSessionCookie} from 'better-auth/cookies';
import {NextResponse, type NextRequest} from 'next/server';

const AUTH_PAGES = ['/sign-in', '/sign-up'];

/**
 * Fast redirect based on the presence of the session cookie. This is only a
 * UX shortcut: the API still checks the session on every request.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const isAuthPage = AUTH_PAGES.includes(request.nextUrl.pathname);

  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
