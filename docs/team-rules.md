# 팀 운영 규칙

## 필수 규칙
1. 머지 전 `npm run test`는 반드시 통과합니다.
2. API 입출력 변경 시 OpenAPI(`packages/contracts/openapi/openapi.yaml`)를 함께 수정합니다.
3. Web 에러 분기는 `error_code` 기준으로만 처리합니다.

## 권장 규칙
- 가능하면 `npm run typecheck`, `npm run lint`도 확인합니다.
- API 계약 변경 시 `npm run build --workspace @aiplus/contracts`를 실행해 생성 타입을 동기화합니다.
- 공통 옵션/매직값은 기존 상수 파일(`apps/web/src/lib/constants/options.ts`)에 합칩니다.
- 문서 영향이 있으면 `README` 또는 `docs/*`를 함께 갱신합니다.
