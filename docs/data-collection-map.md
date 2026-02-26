# Data Collection Map (Integrated)

## Stage 1: Onboarding Conversation
- Event: `onboarding_started`
- Event: `slot_captured`
- Event: `slot_corrected`
- Event: `onboarding_confirmed`
- Persist: `onboarding_sessions`, `onboarding_messages`, `learner_profiles`

## Stage 2: Learning Session (planned)
- Event: `learning_started`, `section_viewed`, `hint_requested`, `learning_completed`
- Persist: `learning_sessions`, `learning_progress`, `user_events`

## Stage 3: Practice Sandbox (planned)
- Event: `practice_started`, `code_run`, `submit_attempt`, `practice_completed`
- Persist: `practice_sessions`, `practice_submissions`, `user_events`
- API 라우트는 아직 본 배포 경로에 노출되지 않았고, 실행 provider wiring은 보류 상태.

## Stage 4: Recommendation (planned)
- Event: `recommendation_impression`, `recommendation_click`, `recommendation_start`, `recommendation_complete`
- Persist: `recommendation_events` or `user_events`
- 현재 이벤트 수집은 Web 액션/DB 적재 경로를 기준으로 운영.
