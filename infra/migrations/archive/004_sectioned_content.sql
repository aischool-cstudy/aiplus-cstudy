-- ==========================================
-- 섹션 기반 콘텐츠 + 교육적 추론 컬럼 추가
-- ==========================================

-- generated_contents에 새 컬럼 추가
ALTER TABLE generated_contents
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reasoning JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;

-- content_version: 1 = 기존 형식(content + code_examples + quiz), 2 = 섹션 형식(sections + reasoning)

COMMENT ON COLUMN generated_contents.sections IS '섹션 기반 콘텐츠 (v2): [{type, title, body, code, ...}]';
COMMENT ON COLUMN generated_contents.reasoning IS 'AI 교육적 추론 과정 (관리자 열람용)';
COMMENT ON COLUMN generated_contents.content_version IS '1=기존 텍스트, 2=섹션 기반';
