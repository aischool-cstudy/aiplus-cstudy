'use client';

/**
 * 브라우저 클라이언트 — Supabase 브라우저 SDK 대신 API 라우트 호출
 * DB 접근은 항상 서버 액션 / API 라우트를 경유합니다.
 */
export function createClient() {
  return {
    auth: {
      async getUser() {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' });
          if (!res.ok) return { data: { user: null }, error: null };
          const user = await res.json();
          return { data: { user }, error: null };
        } catch {
          return { data: { user: null }, error: null };
        }
      },
    },
  };
}
