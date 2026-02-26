## 변경 요약
- 이 PR에서 무엇을 왜 바꿨는지 간단히 적어주세요.

## 영향 범위
- API
- Web
- Contracts(OpenAPI)
- DB Migration

## 체크리스트
### 필수
- [ ] 로컬에서 `npm run test` 통과
- [ ] API 입출력 변경이 있으면 `packages/contracts/openapi/openapi.yaml` 갱신
- [ ] Web 에러 처리 변경 시 `error_code` 기준 분기 유지 확인

### 권장
- [ ] 로컬에서 `npm run typecheck` 통과
- [ ] 로컬에서 `npm run lint` 통과
- [ ] 문서 영향이 있으면 `README` 또는 `docs/*` 갱신
- [ ] API 입출력 변경이 있으면 `npm run build --workspace @aiplus/contracts` 실행 후 Web 타입 반영 확인

## 테스트 메모
- 추가/수정한 테스트와 검증 범위를 적어주세요.
