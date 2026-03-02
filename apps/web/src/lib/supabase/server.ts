/**
 * 서버 사이드 클라이언트 — Supabase SDK 대신 PostgreSQL(pg) 사용
 * 기존 코드의 import 경로를 유지하면서 구현체를 교체합니다.
 */
export { createClient } from '@/lib/db/client';
