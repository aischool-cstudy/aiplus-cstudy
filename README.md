# AI+ 학습 플랫폼 (Next.js + FastAPI)

개인화 학습 경로, 콘텐츠 생성, 학습 기록/복습 루프를 통합한 AI 기반 학습 플랫폼입니다.

## 개발 환경 기준
- Python: `>=3.11` (API 패키지 기준)
- Node.js: `20+` 권장
- npm: 워크스페이스는 `npm@11.8.0` 기준으로 검증

## 프로젝트 구조
- `apps/web`: Next.js 웹 애플리케이션(라우트/컴포넌트/서버 액션)
- `apps/api`: FastAPI 서비스(도메인 로직/API 제공)
- `packages/contracts`: OpenAPI 및 공통 계약 타입(Practice DTO 포함)
- `infra/migrations`: 데이터베이스 마이그레이션
- `docs`: 아키텍처 및 데이터 수집 문서

## 팀 온보딩 문서
- 신규 팀원 시작 순서: `docs/onboarding.md`
- 팀 운영 규칙(경량): `docs/team-rules.md`
- 백엔드 작업 가이드: `docs/backend-guide.md`
- 프론트엔드 작업 가이드: `docs/frontend-guide.md`
- API 계약(OpenAPI) 가이드: `docs/contracts-guide.md`
- 아키텍처 요약: `docs/architecture.md`
- 데이터 수집 맵: `docs/data-collection-map.md`
- 실습 실행 API 드래프트: `docs/practice-api-draft-v0.yaml`

## 주요 기능 (운영 상태)
운영중:
1. 학습 목표/수준 기반 커리큘럼 설계 및 조정
2. 토픽별 학습 콘텐츠 생성, 학습 진행/피드백, 복습 큐
3. 관리자/튜터 챗 인터페이스
4. AI 운영지표(실패율, 재시도, 추천 퍼널, 평가 재도전) 확인

부분운영/계획:
1. 추천 퍼널은 `impression`, `click` 중심으로 운영 중 (`start/complete/dismiss` 확장 예정)
2. Practice 실행 UI/호출은 연동됨 (`/v1/practice/run`), 실행 엔진 백엔드 서비스는 별도 구현/운영

## 아키텍처 원칙 (현재)
- AI 호출 단일 관문: `apps/api` (FastAPI)
- `apps/web`은 화면/인증/DB 오케스트레이션 중심
- 커리큘럼 진단/분석/생성/조정, 개별 콘텐츠 생성, 챗 응답은 FastAPI를 통해 처리

## DB 마이그레이션
신규 데이터베이스는 아래 베이스라인 파일 1회 적용으로 시작합니다.

```bash
psql "postgresql://postgres:postgres@localhost:5432/aiplus" -f infra/migrations/000_baseline_full.sql
```

`DATABASE_URL`이 `postgresql+psycopg://...` 형식이면 `psql`에서 직접 사용할 수 없습니다.  
필요하면 접두사를 `postgresql://`로 바꿔 실행하세요.

`infra/migrations/archive/`는 분할 이력 보관본입니다.

## 빠른 시작
### 0) 저장소 클론
```bash
git clone https://github.com/aischool-cstudy/aiplus-cstudy.git
cd aiplus-cstudy
```

### 1) 런타임 버전 확인
```bash
node -v
npm -v
python3 --version
python3 -m venv --help
python3 -m pip --version
```

### 2) Python 선행 패키지 확인
```bash
python3 -m venv --help
```
둘 중 하나라도 실패하면(WSL/Ubuntu 기준):
```bash
sudo apt-get update
sudo apt-get install -y python3.12-venv python3-pip
```

### 3) 의존성 설치
```bash
npm install
```

### 4) 환경변수 준비
```bash
cp .env.example .env
```

필수(공통):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FASTAPI_URL=http://localhost:8000`
- `AI_PROVIDER` (`gemini` 또는 `openai`)

선택(실습 실행 연동):
- `PRACTICE_API_BASE_URL=http://localhost:8100`

공급자별 필수:
- `AI_PROVIDER=gemini`: `GEMINI_API_KEY` (또는 `GOOGLE_GENERATIVE_AI_API_KEY`)
- `AI_PROVIDER=openai`: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`

권장(튜닝):
- `FASTAPI_MAX_RETRIES=0` (권장: API 내부 재시도를 우선 사용)
- `FASTAPI_RETRY_BASE_MS=250`
- `AI_MAX_CONCURRENCY=4`
- `AI_BACKPRESSURE_ACQUIRE_TIMEOUT_MS=200`

OpenAI 호환 경로는 OpenAI/Groq/OpenRouter처럼 `chat/completions` 규격을 쓰는 API에 공통 적용 가능합니다.

헷갈리기 쉬운 포인트:
- `Supabase = 관리형 PostgreSQL` 입니다.
- 현재 기본 플로우는 `apps/web`가 Supabase SDK로 직접 DB를 사용합니다.
- `REDIS_URL`을 설정하면 Web 서버 액션의 중복 요청 락이 Redis 기반 분산락으로 동작합니다(미설정 시 in-memory 폴백).
- `DATABASE_URL`은 현재 기본 경로에서 필수는 아니며, FastAPI에서 직접 DB를 붙일 때 사용합니다.

### 5) API 실행 (터미널 A)
```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cd ../..
npm run dev:api
```

### 6) Web 실행 (터미널 B)
```bash
npm run dev:web
```

### 7) 확인
- Web: `http://localhost:3000`
- API Health: `http://localhost:8000/health`

## 루트 스크립트
```bash
npm run dev:web
npm run dev:api
npm run build
npm run lint
npm run typecheck
npm run test
npm run quality:report
```

`quality:report`는 API 골든셋 케이스를 기준으로 생성 품질 점수 리포트를 출력합니다.

계약(OpenAPI) 타입만 갱신/검증하려면:
```bash
npm run build --workspace @aiplus/contracts
npm run test --workspace @aiplus/contracts
```
