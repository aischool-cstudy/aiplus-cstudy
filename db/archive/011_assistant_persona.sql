-- learner_profiles: 어시스턴트 페르소나 추가 (코치형/메이트형)

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

COMMENT ON COLUMN learner_profiles.assistant_persona IS '기본 어시스턴트 페르소나 (coach/mate)';
