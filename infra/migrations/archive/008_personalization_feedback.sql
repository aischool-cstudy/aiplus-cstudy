-- ==========================================
-- 개인화 프로필 확장 + 학습 피드백
-- ==========================================

ALTER TABLE learner_profiles
  ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'hobby';

DO $$
BEGIN
  ALTER TABLE learner_profiles
    ADD CONSTRAINT learner_profiles_goal_type_check
    CHECK (goal_type IN ('job', 'work', 'hobby', 'project'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE learner_profiles
  ADD COLUMN IF NOT EXISTS weekly_study_hours INTEGER NOT NULL DEFAULT 5;

DO $$
BEGIN
  ALTER TABLE learner_profiles
    ADD CONSTRAINT learner_profiles_weekly_study_hours_check
    CHECK (weekly_study_hours BETWEEN 1 AND 80);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE learner_profiles
  ADD COLUMN IF NOT EXISTS learning_style TEXT NOT NULL DEFAULT 'concept_first';

DO $$
BEGIN
  ALTER TABLE learner_profiles
    ADD CONSTRAINT learner_profiles_learning_style_check
    CHECK (learning_style IN ('concept_first', 'problem_solving', 'project_building'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN learner_profiles.goal_type IS '학습 목표 유형 (취업/실무/취미/프로젝트)';
COMMENT ON COLUMN learner_profiles.weekly_study_hours IS '주당 학습 가능 시간(시간)';
COMMENT ON COLUMN learner_profiles.learning_style IS '선호 학습 스타일';

ALTER TABLE learning_progress
  ADD COLUMN IF NOT EXISTS understanding_rating INTEGER;

DO $$
BEGIN
  ALTER TABLE learning_progress
    ADD CONSTRAINT learning_progress_understanding_rating_check
    CHECK (understanding_rating BETWEEN 1 AND 5);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE learning_progress
  ADD COLUMN IF NOT EXISTS difficult_concepts TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN learning_progress.understanding_rating IS '학습자 자기 이해도(1~5)';
COMMENT ON COLUMN learning_progress.difficult_concepts IS '어려웠던 개념 태그 목록';

CREATE TABLE IF NOT EXISTS learning_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  curriculum_id UUID REFERENCES user_curriculums(id) ON DELETE CASCADE,
  item_id UUID REFERENCES curriculum_items(id) ON DELETE CASCADE,
  content_id UUID REFERENCES generated_contents(id) ON DELETE CASCADE,
  understanding_rating INTEGER NOT NULL CHECK (understanding_rating BETWEEN 1 AND 5),
  difficult_concepts TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE learning_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can view own learning feedback" ON learning_feedback
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert own learning feedback" ON learning_feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_learning_feedback_user_created
  ON learning_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_feedback_content
  ON learning_feedback(content_id, created_at DESC);
