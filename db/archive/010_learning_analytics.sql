-- ==========================================
-- 개인화 상태 + 평가 시도 + 추천 이벤트
-- ==========================================

CREATE TABLE IF NOT EXISTS learner_concept_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  concept_tag TEXT NOT NULL,
  mastery_score INTEGER NOT NULL DEFAULT 50 CHECK (mastery_score BETWEEN 0 AND 100),
  forgetting_risk INTEGER NOT NULL DEFAULT 0 CHECK (forgetting_risk BETWEEN 0 AND 100),
  confidence_score INTEGER NOT NULL DEFAULT 50 CHECK (confidence_score BETWEEN 0 AND 100),
  encounters INTEGER NOT NULL DEFAULT 0 CHECK (encounters >= 0),
  correct_attempts INTEGER NOT NULL DEFAULT 0 CHECK (correct_attempts >= 0),
  wrong_attempts INTEGER NOT NULL DEFAULT 0 CHECK (wrong_attempts >= 0),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, concept_tag)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  curriculum_id UUID REFERENCES user_curriculums(id) ON DELETE CASCADE,
  item_id UUID REFERENCES curriculum_items(id) ON DELETE CASCADE,
  content_id UUID REFERENCES generated_contents(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL DEFAULT 'full'
    CHECK (attempt_type IN ('full', 'wrong_only', 'variant')),
  total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  wrong_question_indexes INTEGER[] NOT NULL DEFAULT '{}',
  explanations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('impression', 'click', 'start', 'complete', 'dismiss')),
  target_type TEXT,
  target_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE learner_concept_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can view own concept state" ON learner_concept_state
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert own concept state" ON learner_concept_state
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can update own concept state" ON learner_concept_state
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can view own assessment attempts" ON assessment_attempts
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert own assessment attempts" ON assessment_attempts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can view own recommendation events" ON recommendation_events
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert own recommendation events" ON recommendation_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_learner_concept_state_user_risk
  ON learner_concept_state(user_id, forgetting_risk DESC, mastery_score ASC);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user_created
  ON assessment_attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_item_created
  ON assessment_attempts(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_user_surface
  ON recommendation_events(user_id, surface, created_at DESC);
