-- ==========================================
-- generated_contents: 콘텐츠 유형(학습/문제세트) 구분 컬럼 추가
-- ==========================================

ALTER TABLE generated_contents
  ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'lesson';

DO $$
BEGIN
  ALTER TABLE generated_contents
    ADD CONSTRAINT generated_contents_content_kind_check
    CHECK (content_kind IN ('lesson', 'practice_set'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN generated_contents.content_kind IS 'lesson=학습 콘텐츠, practice_set=문제 훈련 세트';
