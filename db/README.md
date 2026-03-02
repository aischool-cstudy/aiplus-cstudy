# Migration Guide

## 기본 원칙
- 신규 데이터베이스는 `000_baseline_full.sql` 한 번만 적용합니다.
- `archive/001~012`는 분할 마이그레이션 이력 보관용입니다.

## 신규 DB 적용
```bash
psql "$DATABASE_URL" -f infra/migrations/000_baseline_full.sql
```

## 주의사항
- `000_baseline_full.sql`은 fresh DB 기준입니다.
- 이미 일부 테이블이 있는 DB에 적용하면 정책/제약 조건 중복 에러가 날 수 있습니다.
- 운영 DB에는 현재 적용 상태에 맞는 증분 마이그레이션 절차를 사용해야 합니다.
