# 신규 팀원 온보딩 가이드

이 문서는 처음 프로젝트를 보는 팀원이 "로컬 실행 -> 구조 이해 -> 첫 수정"까지 빠르게 도달하도록 돕는 안내서입니다.

## 1) 30분 안에 로컬 실행
1. 저장소 루트 이동
```bash
git clone https://github.com/aischool-cstudy/aiplus-cstudy.git
cd aiplus-cstudy
```
2. 의존성 설치
```bash
npm install
```
3. 환경변수 준비
```bash
cp .env.example .env
```
4. API 실행 (터미널 A)
```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cd ../..
npm run dev:api
```
5. Web 실행 (터미널 B)
```bash
npm run dev:web
```
6. 확인
- Web: `http://localhost:3000`
- API Health: `http://localhost:8000/health`

## 2) 읽기 순서 (권장)
1. `README.md`  
2. `docs/architecture.md`  
3. `docs/contracts-guide.md`  
4. `docs/backend-guide.md` 또는 `docs/frontend-guide.md` (담당 영역 우선)

## 3) 핵심 구조 한눈에 보기
- Web 엔트리: `apps/web/src/app`
- Web 서버 액션: `apps/web/src/actions`
- API 엔트리: `apps/api/app/main.py`
- API 라우터: `apps/api/app/api/compat.py`, `apps/api/app/api/public/chat.py`
- API 서비스 계층: `apps/api/app/services/compat`
- 계약 소스: `packages/contracts/openapi/openapi.yaml`

## 4) 팀 공통 개발 규칙
### 필수
- API 입출력 변경 시 OpenAPI(`packages/contracts/openapi/openapi.yaml`)를 함께 수정합니다.
- Web 에러 분기는 `error_code` 기준으로만 처리합니다.
- 머지 전 `npm run test`를 통과합니다.
### 권장
- 중복 상수 추가 대신 `apps/web/src/lib/constants/options.ts`를 재사용합니다.
- 폼 액션은 `rawInput -> zod.safeParse` 패턴을 우선 사용합니다.
- 신규 복잡 로직은 기존 공용 유틸/서비스를 우선 재사용합니다.

## 5) 첫 기여 전에 확인
1. 로컬 품질 확인
```bash
npm run test
```
2. 권장 추가 확인
```bash
npm run typecheck
npm run lint
```
3. PR 작성 시
- 변경 이유와 영향 범위를 요약합니다.
- API 계약 변경이 있으면 OpenAPI를 먼저 갱신하고, 필요 시 문서를 함께 갱신합니다.

## 6) 자주 막히는 포인트
- `FASTAPI_URL` 미설정: Web에서 API 호출이 실패할 수 있습니다.
- API 가상환경 미설치: `npm run dev:api`가 실패합니다.
- OpenAPI 갱신 누락: contracts 테스트에서 실패합니다.
