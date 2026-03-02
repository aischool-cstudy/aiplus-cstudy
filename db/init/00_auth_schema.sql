-- =====================================================================
-- Auth Schema (Supabase auth 대체 — 로컬 PostgreSQL용)
-- =====================================================================
-- Supabase의 auth.users 테이블과 관련 함수를 로컬 PostgreSQL에서 구현합니다.
-- 앱은 postgres 수퍼유저로 연결하므로 RLS는 우회되며,
-- auth.uid() / auth.role() 함수는 RLS 정책 파싱용으로만 존재합니다.

CREATE SCHEMA IF NOT EXISTS auth;

-- auth.users: Supabase auth.users와 호환되는 구조
CREATE TABLE IF NOT EXISTS auth.users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        UNIQUE NOT NULL,
  encrypted_password  TEXT        NOT NULL,
  email_confirmed_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_user_meta_data  JSONB       NOT NULL DEFAULT '{}'
);

-- auth.uid(): 현재 세션 변수에서 사용자 UUID 반환 (RLS 정책 파싱용)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- auth.role(): 현재 세션 역할 반환 (RLS 정책 파싱용)
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
EXCEPTION WHEN OTHERS THEN
  RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE;
