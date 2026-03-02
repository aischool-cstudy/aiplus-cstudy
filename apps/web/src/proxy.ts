import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'auth-token';

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || 'local-dev-secret-change-in-production'
  );
}

async function getUser(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sub   = payload.sub;
    const email = payload.email as string | undefined;
    if (!sub || !email) return null;
    return { id: sub, email };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const user = await getUser(request);

  // 인증이 필요한 보호 경로
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/curriculum') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/generate') ||
    pathname.startsWith('/history') ||
    pathname.startsWith('/review') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/start');

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 이미 로그인 상태에서 auth 페이지 접근 시 대시보드로 리다이렉트
  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // /learn → /curriculum 리다이렉트 (학습 메뉴 제거)
  if (pathname.startsWith('/learn')) {
    const url = request.nextUrl.clone();
    url.pathname = '/curriculum';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
