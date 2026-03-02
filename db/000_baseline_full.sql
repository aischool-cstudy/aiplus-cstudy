-- AI+ Baseline Migration (Squashed)
-- Generated from migration set 001~010
-- Date: 2026-02-25
-- Usage: apply this file once on a fresh database


-- =====================================================================
-- BEGIN: 001_initial_schema.sql
-- =====================================================================
-- ==========================================
-- 교육 플랫폼 MVP 초기 스키마
-- ==========================================

-- profiles: auth.users와 연동
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  daily_generations_remaining INTEGER NOT NULL DEFAULT 5,
  daily_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- learner_profiles: 온보딩 정보
CREATE TABLE IF NOT EXISTS learner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  goal TEXT,
  background TEXT,
  interests TEXT[] NOT NULL DEFAULT '{}',
  level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  preferred_teaching_method TEXT NOT NULL DEFAULT 'socratic' CHECK (preferred_teaching_method IN ('socratic', 'direct_instruction', 'problem_based', 'project_based')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- courses: 학습 코스 (경로)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- topics: 코스 내 토픽 (고정 순서)
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  content_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, slug)
);

-- generated_contents: AI 생성 콘텐츠
CREATE TABLE IF NOT EXISTS generated_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_kind TEXT NOT NULL DEFAULT 'lesson' CHECK (content_kind IN ('lesson', 'practice_set')),
  language TEXT NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  target_audience TEXT NOT NULL DEFAULT '',
  teaching_method TEXT NOT NULL DEFAULT 'socratic' CHECK (teaching_method IN ('socratic', 'direct_instruction', 'problem_based', 'project_based')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  code_examples JSONB NOT NULL DEFAULT '[]',
  quiz JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- learning_progress: 학습 진도
CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  content_id UUID REFERENCES generated_contents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  quiz_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- RLS 정책
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;

-- profiles: 본인 데이터만 읽기/수정
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- learner_profiles
CREATE POLICY "Users can view own learner profile" ON learner_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own learner profile" ON learner_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own learner profile" ON learner_profiles FOR UPDATE USING (auth.uid() = user_id);

-- courses & topics: 모든 인증 사용자 읽기 가능
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view courses" ON courses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view topics" ON topics FOR SELECT USING (auth.role() = 'authenticated');

-- generated_contents
CREATE POLICY "Users can view own contents" ON generated_contents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contents" ON generated_contents FOR INSERT WITH CHECK (auth.uid() = user_id);

-- learning_progress
CREATE POLICY "Users can view own progress" ON learning_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON learning_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON learning_progress FOR UPDATE USING (auth.uid() = user_id);

-- 자동 profile 생성 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Seed: 기본 코스 + 토픽 (Python 기초)
INSERT INTO courses (id, slug, name, description, "order") VALUES
  ('a0000000-0000-0000-0000-000000000001', 'python-basics', 'Python 기초', 'Python 프로그래밍의 기본을 배웁니다.', 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO topics (id, course_id, slug, title, description, "order") VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'variables-and-types', '변수와 자료형', 'Python의 변수 선언과 기본 자료형을 학습합니다.', 1),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'control-flow', '조건문과 반복문', 'if, for, while 등 흐름 제어를 학습합니다.', 2),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'functions', '함수', '함수 정의, 매개변수, 반환값을 학습합니다.', 3),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'lists-and-dicts', '리스트와 딕셔너리', '리스트, 튜플, 딕셔너리 등 자료구조를 학습합니다.', 4),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'file-io', '파일 입출력', '파일 읽기/쓰기와 예외 처리를 학습합니다.', 5)
ON CONFLICT (course_id, slug) DO NOTHING;

-- END: 001_initial_schema.sql


-- =====================================================================
-- BEGIN: 002_curriculum_schema.sql
-- =====================================================================
-- ==========================================
-- 커리큘럼 시스템 스키마
-- ==========================================

-- user_curriculums: 사용자별 맞춤 커리큘럼
CREATE TABLE IF NOT EXISTS user_curriculums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  assessed_level TEXT NOT NULL DEFAULT 'beginner' CHECK (assessed_level IN ('beginner', 'intermediate', 'advanced')),
  teaching_method TEXT NOT NULL DEFAULT 'socratic' CHECK (teaching_method IN ('socratic', 'direct_instruction', 'problem_based', 'project_based')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  total_days INTEGER NOT NULL DEFAULT 14,
  start_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- curriculum_items: 커리큘럼 내 개별 학습 항목
CREATE TABLE IF NOT EXISTS curriculum_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID NOT NULL REFERENCES user_curriculums(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  day_number INTEGER NOT NULL DEFAULT 1,
  order_in_day INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  content_id UUID REFERENCES generated_contents(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- level_assessments: 수준 진단
CREATE TABLE IF NOT EXISTS level_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  curriculum_id UUID REFERENCES user_curriculums(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  answers JSONB NOT NULL DEFAULT '[]',
  assessed_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- curriculum_chats: 커리큘럼 조정 대화
CREATE TABLE IF NOT EXISTS curriculum_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID NOT NULL REFERENCES user_curriculums(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE user_curriculums ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_chats ENABLE ROW LEVEL SECURITY;

-- user_curriculums
CREATE POLICY "Users can view own curriculums" ON user_curriculums FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own curriculums" ON user_curriculums FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own curriculums" ON user_curriculums FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own curriculums" ON user_curriculums FOR DELETE USING (auth.uid() = user_id);

-- curriculum_items (via curriculum ownership)
CREATE POLICY "Users can view own curriculum items" ON curriculum_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_curriculums WHERE id = curriculum_items.curriculum_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own curriculum items" ON curriculum_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_curriculums WHERE id = curriculum_items.curriculum_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own curriculum items" ON curriculum_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_curriculums WHERE id = curriculum_items.curriculum_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own curriculum items" ON curriculum_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM user_curriculums WHERE id = curriculum_items.curriculum_id AND user_id = auth.uid()));

-- level_assessments
CREATE POLICY "Users can view own assessments" ON level_assessments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assessments" ON level_assessments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- curriculum_chats (via curriculum ownership)
CREATE POLICY "Users can view own curriculum chats" ON curriculum_chats FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_curriculums WHERE id = curriculum_chats.curriculum_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own curriculum chats" ON curriculum_chats FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_curriculums WHERE id = curriculum_chats.curriculum_id AND user_id = auth.uid()));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_curriculum_items_curriculum ON curriculum_items(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_items_day ON curriculum_items(curriculum_id, day_number);
CREATE INDEX IF NOT EXISTS idx_curriculum_chats_curriculum ON curriculum_chats(curriculum_id);

-- END: 002_curriculum_schema.sql


-- =====================================================================
-- BEGIN: 003_chat_messages.sql
-- =====================================================================
-- ==========================================
-- 챗봇 메시지 테이블
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('manager', 'tutor')),
  context_id UUID, -- 튜터: curriculum_id, 매니저: NULL
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat messages" ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat messages" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_type ON chat_messages(user_id, chat_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_context ON chat_messages(context_id);

-- END: 003_chat_messages.sql


-- =====================================================================
-- BEGIN: 004_sectioned_content.sql
-- =====================================================================
-- ==========================================
-- 섹션 기반 콘텐츠 + 교육적 추론 컬럼 추가
-- ==========================================

-- generated_contents에 새 컬럼 추가
ALTER TABLE generated_contents
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reasoning JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;

-- content_version: 1 = 기본 형식(content + code_examples + quiz), 2 = 섹션 형식(sections + reasoning)

COMMENT ON COLUMN generated_contents.sections IS '섹션 기반 콘텐츠 (v2): [{type, title, body, code, ...}]';
COMMENT ON COLUMN generated_contents.reasoning IS 'AI 교육적 추론 과정 (관리자 열람용)';
COMMENT ON COLUMN generated_contents.content_version IS '1=기본 텍스트, 2=섹션 기반';

-- END: 004_sectioned_content.sql


-- =====================================================================
-- BEGIN: 005_cached_reasoning.sql
-- =====================================================================
-- curriculum_items에 Phase 1 추론 결과 캐싱용 컬럼 추가
-- Phase 2 실패 시 재시도할 때 Phase 1을 다시 호출하지 않기 위함
ALTER TABLE curriculum_items
  ADD COLUMN IF NOT EXISTS cached_reasoning JSONB DEFAULT NULL;

-- END: 005_cached_reasoning.sql


-- =====================================================================
-- BEGIN: 006_teaching_method.sql
-- =====================================================================
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

-- END: 006_teaching_method.sql


-- =====================================================================
-- BEGIN: 012_content_kind.sql
-- =====================================================================
-- generated_contents: 콘텐츠 유형(학습 본문/문제 세트) 구분
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

-- END: 012_content_kind.sql


-- =====================================================================
-- BEGIN: 007_learning_preferences.sql
-- =====================================================================
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

-- END: 007_learning_preferences.sql


-- =====================================================================
-- BEGIN: 008_personalization_feedback.sql
-- =====================================================================
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

ALTER TABLE learner_profiles
  ADD COLUMN IF NOT EXISTS assistant_persona TEXT NOT NULL DEFAULT 'coach';

DO $$
BEGIN
  ALTER TABLE learner_profiles
    ADD CONSTRAINT learner_profiles_assistant_persona_check
    CHECK (assistant_persona IN ('coach', 'mate'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN learner_profiles.goal_type IS '학습 목표 유형 (취업/실무/취미/프로젝트)';
COMMENT ON COLUMN learner_profiles.weekly_study_hours IS '주당 학습 가능 시간(시간)';
COMMENT ON COLUMN learner_profiles.learning_style IS '선호 학습 스타일';
COMMENT ON COLUMN learner_profiles.assistant_persona IS '기본 어시스턴트 페르소나 (coach/mate)';

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

-- END: 008_personalization_feedback.sql


-- =====================================================================
-- BEGIN: 009_ai_generation_logs.sql
-- =====================================================================
-- ==========================================
-- AI 생성 파이프라인 로그
-- ==========================================

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pipeline TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'final',
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  error_code TEXT,
  error_message TEXT,
  latency_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can view own ai generation logs" ON ai_generation_logs
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert own ai generation logs" ON ai_generation_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_user_created
  ON ai_generation_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_pipeline_status
  ON ai_generation_logs(pipeline, status, created_at DESC);

-- END: 009_ai_generation_logs.sql


-- =====================================================================
-- BEGIN: 010_learning_analytics.sql
-- =====================================================================
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

-- END: 010_learning_analytics.sql
