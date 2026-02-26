# Architecture

## Goals
- FastAPI에 도메인 로직 집중
- Next.js에 UI/사용자 흐름 집중
- OpenAPI 기반 계약 일원화
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

## Contracts Workflow
- OpenAPI 소스: `packages/contracts/openapi/openapi.yaml`
- 생성 타입: `packages/contracts/src/openapi.ts` (자동 생성 파일)
- 갱신: `npm run build --workspace @aiplus/contracts`
- 검증: `npm run test --workspace @aiplus/contracts`

## Extension Strategy
- Practice Sandbox는 현재 본 운영 경로에 미연결 상태이며, 실행 엔진 연동이 계획되어 있음
- 실행 엔진(Judge0/Piston/커스텀)은 provider 추상화 계층으로 교체 가능하게 설계 예정
