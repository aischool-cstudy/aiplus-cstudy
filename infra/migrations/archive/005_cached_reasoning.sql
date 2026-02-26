-- curriculum_items에 Phase 1 추론 결과 캐싱용 컬럼 추가
-- Phase 2 실패 시 재시도할 때 Phase 1을 다시 호출하지 않기 위함
ALTER TABLE curriculum_items
  ADD COLUMN IF NOT EXISTS cached_reasoning JSONB DEFAULT NULL;
