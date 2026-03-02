/**
 * Admin 클라이언트 — Supabase Service Role 대신 PostgreSQL 수퍼유저 사용
 * 기존 코드의 import 경로를 유지하면서 구현체를 교체합니다.
 */
export { createAdminClient } from '@/lib/db/client';
