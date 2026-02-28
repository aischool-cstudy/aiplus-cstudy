# Architecture

## Goals
- FastAPI에 도메인 로직 집중
- Next.js에 UI/사용자 흐름 집중
- 내부 FastAPI 계약은 OpenAPI 기반으로 일원화
- 스키마 변경은 additive-first 원칙 유지

## Layering
1. Web (`apps/web`): 라우트, 페이지, UI 컴포넌트, 서버 액션
2. API (`apps/api`): 학습 도메인 API 및 서비스 계층
3. Contracts (`packages/contracts`): OpenAPI + DTO 타입
4. Data (`infra/migrations`): 베이스라인 스키마 + 분할 이력 보관본

## Exposed Routes
- `GET /health`
- `POST /api/generate`
- `POST /api/search`
- `POST /api/validate`
- `POST /api/recommendations`
- `POST /api/chat`
- `POST /api/assessment/questions`
- `POST /api/assessment/analyze`
- `POST /api/curriculum/generate`
- `POST /api/curriculum/refine`
- `POST /api/curriculum/reasoning`
- `POST /api/curriculum/sections`
- `GET /api/auth/callback`

## External Integration Routes
- `POST {PRACTICE_API_BASE_URL}/v1/practice/run` (Web 서버 액션 -> 외부 Practice 실행 API)

## Contracts Workflow
- OpenAPI 소스: `packages/contracts/openapi/openapi.yaml`
- 생성 타입: `packages/contracts/src/openapi.ts` (자동 생성 파일)
- 갱신: `npm run build --workspace @aiplus/contracts`
- 검증: `npm run test --workspace @aiplus/contracts`

## Extension Strategy
- Practice 실행 UI/호출 경로는 Web에 연결되어 있음
- 실행 엔진 서비스는 별도 백엔드(예: Nest)에서 운영 가능하도록 분리됨
- 계약은 `docs/practice-api-draft-v0.yaml` + `packages/contracts/src/practice.ts` 동기화로 관리
- 실행 엔진(Judge0/Piston/커스텀)은 provider 추상화 계층으로 교체 가능하게 설계 예정
