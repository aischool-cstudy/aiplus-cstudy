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
