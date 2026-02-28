# Data Collection Map

이 문서는 "지금 실제로 어떤 데이터가 언제 수집되고, 어디에 저장되며, 무엇에 쓰이는지"를 단계별로 정리한 운영 기준 문서입니다.

## 상태 범례
- 운영중: 현재 화면/액션에서 실제로 수집 및 사용
- 부분운영: 스키마/엔드포인트는 준비됐지만 일부 화면에서만 사용
- 계획: 스키마/흐름은 의도되어 있으나 본 경로에서 미사용

## 한눈에 보는 순환
1. 온보딩/설정으로 학습자 프로필을 저장
2. 커리큘럼/콘텐츠 생성 시 AI 실행 로그를 기록
3. 학습 진행/피드백/평가 시도를 누적
4. 복습 큐와 추천 UI를 통해 다음 학습 액션 제시
5. Practice 실행 API로 코드 실행 결과를 즉시 확인
6. 운영지표 화면에서 안정성/전환/재도전 흐름을 집계

## Stage 1. 온보딩/프로필 수집 (운영중)
- 발생 시점: 회원가입 후 온보딩 제출, 설정 변경
- 주요 입력: 목표, 배경, 수준, 선호 교수법, 목표 유형, 주당 학습시간, 학습 스타일, 페르소나
### 저장 테이블
- `profiles`, `learner_profiles`
### 사용처
- 커리큘럼 생성 기본값
- 콘텐츠 생성 파라미터
- 채팅 페르소나/컨텍스트

참고:
- 현재는 `onboarding_sessions`, `onboarding_messages` 같은 별도 온보딩 이벤트 테이블을 사용하지 않습니다.
- 온보딩 단계 이벤트명 목록보다, 최종 프로필 상태(`learner_profiles`)가 운영 기준입니다.

## Stage 2. 커리큘럼/콘텐츠 생성 로그 (운영중)
- 발생 시점: 진단 질문 생성, 레벨 분석, 커리큘럼 생성/수정, 학습 콘텐츠 생성
### 저장 테이블
- `user_curriculums`
- `curriculum_items`
- `level_assessments`
- `generated_contents`
- `ai_generation_logs`
### 핵심 로그 필드
- `pipeline`, `stage`, `status(started/success/failed)`
- `error_code`, `error_message`, `latency_ms`
- `metadata.aiCall(attemptCount, fallbackUsed, provider, model ...)`
### 사용처
- AI 운영지표(실패율, 재시도율, 폴백률, 모델별 안정성)
- 장애 원인 추적 및 품질 개선

## Stage 3. 학습 진행/이해도 피드백 (운영중)
- 발생 시점: 학습 항목 시작/완료, 이해도 제출, 어려운 개념 입력
### 저장 테이블
- `learning_progress`
- `learning_feedback`
- `learner_concept_state`
### 사용처
- 복습 우선순위 계산
- 개념 숙련도/망각 위험 업데이트
- 다음 학습 추천 품질 개선

## Stage 4. 평가/오답 재도전 루프 (운영중)
- 발생 시점: 퀴즈 제출, 오답만 재도전, 변형 문제 시도
### 저장 테이블
- `assessment_attempts`
### 핵심 필드
- `attempt_type(full/wrong_only/variant)`
- `score`, `wrong_question_indexes`, `explanations`
### 사용처
- 히스토리의 오답 복습 큐 구성
- 재도전 성과 분석
- 운영지표의 평가 시도/평균점수 집계

## Stage 5. 추천 이벤트 퍼널 (부분운영)
- 발생 시점: 추천 카드 노출/클릭 등 UI 상호작용
- 수집 엔드포인트: `POST /api/events/recommendation`
### 저장 테이블
- `recommendation_events`
### 허용 액션
- `impression`, `click`, `start`, `complete`, `dismiss`
### 현재 사용 상태
- 대시보드 브리핑 영역에서 `impression`, `click` 중심으로 수집
- `start/complete/dismiss`는 스키마/엔드포인트는 준비됐으나 사용 범위 확대 여지 있음
### 사용처
- surface별 CTR, 시작률, 완료율 집계
- 추천 UI 개선 우선순위 판단

## Stage 6. 학습 매니저/튜터 챗 로그 (운영중)
- 발생 시점: `/api/chat` 사용 시 사용자/어시스턴트 메시지 저장
### 저장 테이블
- `chat_messages`
### 핵심 필드
- `chat_type(manager/tutor)`, `context_id`, `role`, `content`
### 사용처
- 대화 맥락 유지 및 기록 조회
- 추후 챗 품질 분석 기반 데이터

## Stage 7. 운영지표 집계 (운영중)
- 집계 액션: `apps/web/src/actions/analytics.ts`
### 집계 소스
- `ai_generation_logs`
- `recommendation_events`
- `assessment_attempts`
### 주요 산출
- run 상태(`running/completed/failed/abandoned`)
- 실패율(진행중 제외)
- 실패 코드 분포
- 추천 퍼널(노출/클릭/시작/완료)
- 평가 재도전 지표

## Stage 8. Practice 실행 결과 (부분운영)
- 발생 시점: 학습 화면의 "코드 실행" 버튼 클릭
- 호출 엔드포인트: `POST {PRACTICE_API_BASE_URL}/v1/practice/run`
### 현재 저장 상태
- 프론트는 응답(`passed/stdout/stderr`)을 즉시 표시
- DB 영속 저장/운영지표 집계는 아직 미연결
### 사용처
- 학습자 즉시 피드백(정답/오답, 출력/에러 확인)

## 계획 중 항목
- Practice 실행 결과의 저장/집계 파이프라인 연결
- 범용 `user_events` 단일 이벤트 버스 도입 여부 결정
- 추천 이벤트 `start/complete/dismiss` 수집 지점 확대
