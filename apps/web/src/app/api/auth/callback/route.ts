import { NextResponse } from 'next/server';

/**
 * OAuth 콜백 — 로컬 PostgreSQL 환경에서는 OAuth 미사용
 * Supabase 제거 후 이 엔드포인트는 실제로 호출되지 않지만
 * 빌드 오류 방지를 위해 유지합니다.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login?error=oauth_not_supported`);
}
