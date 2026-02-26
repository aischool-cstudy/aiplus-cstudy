# API 계약(OpenAPI) 가이드

## 1) 단일 소스 원칙
- 계약의 원본은 `packages/contracts/openapi/openapi.yaml` 입니다.
- Web/API 구현은 이 계약을 따라야 합니다.

## 2) 생성 파일
- `packages/contracts/src/openapi.ts` 는 자동 생성 파일입니다.
- 수동 수정하지 않습니다.

생성 스크립트:
- `packages/contracts/scripts/generate-openapi-types.mjs`

## 3) 계약 변경 절차
1. `openapi.yaml` 수정
2. 생성 타입 갱신 (OpenAPI 변경 시 필수)
```bash
npm run build --workspace @aiplus/contracts
```
3. 동기화 검증(권장)
```bash
npm run test --workspace @aiplus/contracts
```
4. Web/API 코드에서 새 계약 타입 반영

## 4) 에러 계약 규칙
에러 응답은 아래 필드를 기본으로 사용합니다.
- `error_code`
- `message`
- `retryable`
- `trace_id`
- `detail` (하위호환)

Web은 `error_code` 기준으로만 매핑해야 합니다.

## 5) 변경 시 체크 포인트
### 필수
- OpenAPI 경로와 FastAPI 실제 라우트가 일치하는지 확인
- enum 값이 Web의 `error_code` 분기와 일치하는지 확인
### 권장
- 변경된 요청/응답 스키마에 맞춰 테스트가 업데이트됐는지

## 6) 자주 하는 실수
- `openapi.yaml`은 수정했지만 생성 타입 갱신을 누락함
- 생성 타입을 수동 편집함
- Web에서 문자열 메시지(`detail`)로 분기함
