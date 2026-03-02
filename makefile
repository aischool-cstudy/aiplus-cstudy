.PHONY: up down restart build logs ps \
        up-db up-api up-web up-excutor \
        build-api build-web build-excutor \
        logs-api logs-web logs-excutor \
        restart-api restart-web restart-excutor \
        clean prune shell-api shell-web shell-excutor

# ── 전체 ────────────────────────────────────────────────────────

up:           ## 전체 서비스 시작
	docker compose up -d

down:         ## 전체 서비스 중지 및 컨테이너 제거
	docker compose down

restart:      ## 전체 서비스 재시작
	docker compose restart

build:        ## 전체 이미지 빌드 (캐시 미사용)
	docker compose build --no-cache

logs:         ## 전체 로그 실시간 출력
	docker compose logs -f

ps:           ## 컨테이너 상태 확인
	docker compose ps

# ── 개별 시작 ────────────────────────────────────────────────────

up-db:        ## db만 시작
	docker compose up -d db

up-api:       ## api만 시작
	docker compose up -d api

up-web:       ## web만 시작
	docker compose up -d web

up-excutor:   ## excutor만 시작
	docker compose up -d excutor

# ── 개별 빌드 ────────────────────────────────────────────────────

build-api:    ## api 이미지 재빌드
	docker compose build api

build-web:    ## web 이미지 재빌드
	docker compose build web

build-excutor: ## excutor 이미지 재빌드
	docker compose build excutor

# ── 개별 로그 ────────────────────────────────────────────────────

logs-api:     ## api 로그 실시간 출력
	docker compose logs -f api

logs-web:     ## web 로그 실시간 출력
	docker compose logs -f web

logs-excutor: ## excutor 로그 실시간 출력
	docker compose logs -f excutor

# ── 개별 재시작 ──────────────────────────────────────────────────

restart-api:  ## api 재시작
	docker compose restart api

restart-web:  ## web 재시작
	docker compose restart web

restart-excutor: ## excutor 재시작
	docker compose restart excutor

# ── 쉘 접속 ─────────────────────────────────────────────────────

shell-api:    ## api 컨테이너 쉘 접속
	docker compose exec api bash

shell-web:    ## web 컨테이너 쉘 접속
	docker compose exec web bash

shell-excutor: ## excutor 컨테이너 쉘 접속
	docker compose exec excutor bash

# ── 정리 ────────────────────────────────────────────────────────

clean:        ## 컨테이너 + 볼륨 제거 (DB 데이터 포함)
	docker compose down -v

prune:        ## 미사용 이미지/캐시 정리
	docker image prune -f
	docker builder prune -f

# ── 도움말 ──────────────────────────────────────────────────────

help:         ## 사용 가능한 명령 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
