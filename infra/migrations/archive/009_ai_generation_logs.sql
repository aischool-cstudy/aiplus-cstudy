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
