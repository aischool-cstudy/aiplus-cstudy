import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

interface AuthErrorShape {
  code?: string;
}

function isRefreshTokenNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as AuthErrorShape;
  return row.code === 'refresh_token_not_found';
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  const authCookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith('sb-') && name.includes('-auth-token'));

  authCookieNames.forEach((name) => {
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
    });
  });
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const {
      data: { user: resolvedUser },
    } = await supabase.auth.getUser();
    user = resolvedUser;
  } catch (error) {
    if (isRefreshTokenNotFoundError(error)) {
      clearSupabaseAuthCookies(request, supabaseResponse);
    } else {
      console.error('[proxy] supabase auth.getUser failed:', error);
    }
  }

  const { pathname } = request.nextUrl;

  // Protected routes: redirect to login if not authenticated
  if (
    !user &&
    (pathname.startsWith('/dashboard') ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/learn') ||
      pathname.startsWith('/generate') ||
      pathname.startsWith('/history') ||
      pathname.startsWith('/review') ||
      pathname.startsWith('/settings'))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If logged in and trying to access auth pages, redirect to dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // 학습 메뉴 제거: /learn 접근 시 커리큘럼으로 리다이렉트
  if (pathname.startsWith('/learn')) {
    const url = request.nextUrl.clone();
    url.pathname = '/curriculum';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
