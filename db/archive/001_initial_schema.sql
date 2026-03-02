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
