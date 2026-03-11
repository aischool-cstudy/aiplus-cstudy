# AI+ 학습 플랫폼

AI 기반 개인화 학습 플랫폼. 커리큘럼 설계, 콘텐츠 생성, 코드 실습 실행을 통합합니다.

## 빠른실행방법

```wsl 환경

docker-compose.yaml 이 존재하는 디렉토리 위치에서
명령어: 'make up'
빌드 완료후 http://localhost:3000 실행

```

## 서비스 구성

| 서비스    | 기술          | 포트 | 역할                                |
| --------- | ------------- | ---- | ----------------------------------- |
| `web`     | Next.js 15    | 3000 | 프론트엔드 + 서버 액션              |
| `api`     | FastAPI       | 8000 | AI 파이프라인, 커리큘럼/콘텐츠 생성 |
| `excutor` | NestJS        | 8100 | 코드 실습 실행 (Docker sandbox)     |
| `db`      | PostgreSQL 16 | 5432 | 데이터베이스                        |

## 프로젝트 구조

```
aiplus-cstudy/
├── apps/
│   ├── web/          # Next.js (워크스페이스)
│   ├── api/          # FastAPI
│   └── excutor/      # NestJS — 코드 실행 sandbox
├── packages/
│   └── contracts/    # 공통 타입 / OpenAPI 계약
├── db/               # PostgreSQL 초기화 스크립트
├── docker-compose.yaml
└── makefile
```

## 빠른 시작

### 1. 환경변수 준비

```bash
cp .env.example .env
```

`.env` 필수 항목:

```env
# AI 공급자 선택: gemini | openai
AI_PROVIDER=gemini
GEMINI_API_KEY=...          # AI_PROVIDER=gemini 일 때
# OPENAI_API_KEY=...        # AI_PROVIDER=openai 일 때
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1

JWT_SECRET=your-secret-here
```

### 2. Docker로 전체 실행

```bash
make up       # 전체 서비스 시작
make logs     # 전체 로그 확인
make down     # 중지
```

### 3. 접속 확인

| 주소                         | 설명            |
| ---------------------------- | --------------- |
| http://localhost:3000        | 웹              |
| http://localhost:8000/docs   | FastAPI Swagger |
| http://localhost:8000/health | API 헬스체크    |
| http://localhost:8100        | 코드 실행 API   |

## Make 명령어

```bash
make up               # 전체 시작
make down             # 전체 중지
make build            # 전체 이미지 재빌드 (no-cache)
make ps               # 컨테이너 상태 확인

# 개별 서비스
make up-api           # api만 시작
make up-web           # web만 시작
make up-excutor       # excutor만 시작

make logs-api         # api 로그 팔로우
make logs-web         # web 로그 팔로우
make logs-excutor     # excutor 로그 팔로우

make build-api        # api 이미지 재빌드
make build-web        # web 이미지 재빌드
make build-excutor    # excutor 이미지 재빌드

make shell-api        # api 컨테이너 쉘
make shell-web        # web 컨테이너 쉘
make shell-excutor    # excutor 컨테이너 쉘

make clean            # 컨테이너 + 볼륨 전체 제거 (DB 포함)
make prune            # 미사용 이미지/캐시 정리
```

## 핫리로드

모든 서비스는 개발용 dockerfile(`dockerfile.dev`)로 소스를 볼륨 마운트하여 핫리로드가 동작합니다.

| 서비스    | 감시 경로           | 방식               |
| --------- | ------------------- | ------------------ |
| `api`     | `apps/api/app/`     | uvicorn `--reload` |
| `web`     | `apps/web/`         | Next.js `dev`      |
| `excutor` | `apps/excutor/src/` | NestJS `--watch`   |

> 패키지(pip/npm)를 추가한 경우 `make build-{서비스}`로 이미지를 재빌드해야 합니다.

## DB 마이그레이션

신규 DB는 베이스라인 SQL 1회 적용으로 시작합니다.

```bash
psql "postgresql://postgres:postgres@localhost:5432/aiplus" \
     -f db/000_baseline_full.sql
```

## 개발 환경 요구사항

- Docker Desktop (또는 Docker Engine + Compose v2)
- Node.js 20+ / npm (로컬 개발 시)
- Python 3.11+ (로컬 개발 시)


#test1