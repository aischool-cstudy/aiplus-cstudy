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
