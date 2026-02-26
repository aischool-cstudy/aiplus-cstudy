-- ==========================================
-- 학습 선호(교수법) 컬럼 추가
-- ==========================================

ALTER TABLE learner_profiles
  ADD COLUMN IF NOT EXISTS preferred_teaching_method TEXT NOT NULL DEFAULT 'socratic';

DO $$
BEGIN
  ALTER TABLE learner_profiles
    ADD CONSTRAINT learner_profiles_preferred_teaching_method_check
    CHECK (preferred_teaching_method IN ('socratic', 'direct_instruction', 'problem_based', 'project_based'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE user_curriculums
  ADD COLUMN IF NOT EXISTS teaching_method TEXT NOT NULL DEFAULT 'socratic';

DO $$
BEGIN
  ALTER TABLE user_curriculums
    ADD CONSTRAINT user_curriculums_teaching_method_check
    CHECK (teaching_method IN ('socratic', 'direct_instruction', 'problem_based', 'project_based'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN learner_profiles.preferred_teaching_method IS '사용자 기본 선호 교수법';
COMMENT ON COLUMN user_curriculums.teaching_method IS '해당 커리큘럼의 교수법';
