# 백엔드 작업 가이드

## 1) 디렉터리 역할
- 엔트리: `apps/api/app/main.py`
- HTTP 라우트: `apps/api/app/api/compat.py`, `apps/api/app/api/public/chat.py`
- 서비스 계층: `apps/api/app/services/compat`
- 설정: `apps/api/app/core/config.py`
- AI 도메인: `apps/api/app/domain/ai`
- 테스트: `apps/api/tests`

## 2) 요청 흐름
1. FastAPI 라우터가 요청/응답 스키마를 받습니다.
2. 라우터는 서비스 함수를 호출합니다.
3. 서비스 계층에서 정규화, 품질게이트, 폴백, AI 호출을 처리합니다.
4. 예외는 `main.py`의 예외 핸들러에서 공통 포맷으로 응답합니다.

## 3) 에러 응답 규약
기본 응답 필드:
- `error_code`
- `message`
- `retryable`
- `trace_id`
- `detail` (하위호환)

관련 코드:
- `apps/api/app/services/compat/error_policy.py`
- `apps/api/app/main.py`

## 4) 새 API 추가 절차
1. 요청/응답 모델을 서비스 계층 또는 라우터에서 정의합니다.
2. 라우터(`compat.py` 등)에는 HTTP 입출력만 둡니다.
3. 복잡 로직은 서비스 모듈로 이동합니다.
4. API 입출력이 바뀌면 `openapi.yaml`을 갱신합니다.
5. 변경 경계를 검증하는 테스트를 추가합니다.

## 5) 기존 생성 파이프라인 핵심 파일
- 생성/정규화/품질: `apps/api/app/services/compat/generation_service.py`
- 정규화 유틸: `apps/api/app/services/compat/normalizer_validator.py`
- 파이프라인 런타임/재시도: `apps/api/app/services/compat/pipeline_runtime.py`
- 에러 정책: `apps/api/app/services/compat/error_policy.py`

## 6) 테스트 실행
루트에서:
```bash
npm run test --workspace api
```

API만 직접:
```bash
cd apps/api
source .venv/bin/activate
python -m pytest -q
```

## 7) 리뷰 기준
### 필수
- 라우터가 서비스 로직을 직접 품지 않는지
- 에러 코드가 규약 enum에 맞는지
- 테스트가 성공/실패 경계를 최소 1개 이상 검증하는지
### 권장
- `except Exception` 남용 없이 예상 예외를 우선 분기했는지
- 성능/장애 대응(타임아웃, 재시도, 폴백) 로그가 충분한지
