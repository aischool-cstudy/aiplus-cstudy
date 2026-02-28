# 프론트엔드 작업 가이드

## 1) 디렉터리 역할
- 라우트 페이지: `apps/web/src/app`
- 서버 액션: `apps/web/src/actions`
- AI 클라이언트/스키마: `apps/web/src/lib/ai`
- Practice 클라이언트: `apps/web/src/lib/practice`
- 런타임 유틸: `apps/web/src/lib/runtime`
- 복습 점수 유틸: `apps/web/src/lib/review`
- 폼 파서: `apps/web/src/lib/forms/learner-form.ts`
- 공통 상수: `apps/web/src/lib/constants/options.ts`
- 분석 유틸: `apps/web/src/lib/analytics`
- 테스트: `apps/web/src/lib/**/*.test.ts`

## 2) AI 호출 흐름
1. 서버 액션(`apps/web/src/actions/*.ts`)에서 입력을 수집합니다.
2. Zod로 `rawInput -> safeParse` 검증합니다.
3. `apps/web/src/lib/ai/client.ts`를 통해 원격 호출합니다.
4. 실제 HTTP 호출은 `apps/web/src/lib/ai/impl/remote.ts`가 담당합니다.
5. 에러 분기는 `error_code` 기준으로 `apps/web/src/lib/ai/errors.ts`에서 처리합니다.

## 3) 폼 처리 규칙
### 필수
- `FormData` 파싱은 `parseLearnerFormData`를 재사용합니다.
- 공통값(난이도/언어/문항수 등)은 `apps/web/src/lib/constants/options.ts`를 사용합니다.
### 권장
- 필드 정규화는 `getString`, `getOptionalString` 공통 헬퍼를 사용합니다.
- onboarding/settings는 동일한 검증 파이프라인을 유지합니다.

관련 파일:
- `apps/web/src/actions/onboarding.ts`
- `apps/web/src/actions/settings.ts`
- `apps/web/src/lib/forms/learner-form.ts`

## 4) UI/도메인 일관성 규칙
- 옵션 하드코딩 금지: `apps/web/src/lib/constants/options.ts` 사용
- 퀴즈 선택지 정규화는 `apps/web/src/lib/quiz/options.ts` 사용
- `alert()` 대신 인라인/토스트 기반 에러 UX 유지

## 5) 운영지표 해석 규칙
- run 상태: `running`, `completed`, `failed`, `abandoned`
- 실패율 계산 시 `running`은 제외

관련 파일:
- `apps/web/src/actions/analytics.ts`
- `apps/web/src/lib/analytics/run-metrics.ts`
- `apps/web/src/lib/analytics/error-breakdown.ts`

## 6) Practice 실행 흐름
1. UI 컴포넌트(`PracticeRunner`)가 코드 실행 액션을 호출합니다.
2. 서버 액션(`apps/web/src/actions/practice.ts`)에서 입력 검증 후 클라이언트를 호출합니다.
3. 클라이언트(`apps/web/src/lib/practice/client.ts`)가 `POST {PRACTICE_API_BASE_URL}/v1/practice/run` 요청을 보냅니다.
4. 응답은 `@aiplus/contracts`의 `PracticeRunResponse`, `PracticeErrorResponse` 타입으로 해석합니다.

관련 파일:
- `apps/web/src/components/features/learn/practice-runner.tsx`
- `apps/web/src/actions/practice.ts`
- `apps/web/src/lib/practice/client.ts`
- `packages/contracts/src/practice.ts`

## 7) 테스트/검증
필수:
```bash
npm run test --workspace web
npm run typecheck --workspace web
```
권장:
```bash
npm run lint --workspace web
```

## 8) 리뷰 기준
### 필수
- 문자열 contains 기반 에러 분기가 없는지
- 서버 액션에서 입력 검증 누락이 없는지
- 상수/유틸 중복 구현이 없는지
### 권장
- 상태값(`running` 등) 집계 기준이 일관적인지
- 사용성 이슈(인라인 에러/재시도 흐름)가 깨지지 않았는지
