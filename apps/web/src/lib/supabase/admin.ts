import { createClient } from '@supabase/supabase-js';

/**
 * Service Role 클라이언트 — RLS를 우회하여 시스템 레벨 작업 수행
 * (예: topics.content_id 업데이트)
 * 
 * 주의: 서버 액션/API 라우트에서만 사용할 것. 클라이언트에 노출 금지.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
