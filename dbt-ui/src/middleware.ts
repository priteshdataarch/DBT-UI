import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (process.env.DBT_UI_REQUIRE_LOGIN !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (pathname === '/login/admin') {
    if (req.auth) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth') || pathname === '/login') {
    return NextResponse.next();
  }

  // First admin bootstrap: GET status + POST register (route rejects once users exist)
  if (pathname === '/api/register') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/cron/tick')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api')) {
    if (!req.auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
