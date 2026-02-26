-- ==========================================
-- generated_contents: 교육법 선택 컬럼 추가
-- ==========================================

ALTER TABLE generated_contents
  ADD COLUMN IF NOT EXISTS teaching_method TEXT NOT NULL DEFAULT 'socratic';

DO $$
BEGIN
  ALTER TABLE generated_contents
    ADD CONSTRAINT generated_contents_teaching_method_check
    CHECK (teaching_method IN ('socratic', 'direct_instruction', 'problem_based', 'project_based'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN generated_contents.teaching_method IS '콘텐츠 생성 시 선택된 교수법';
