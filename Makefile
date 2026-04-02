.PHONY: help install infra infra-down infra-logs \
       backend agent agent-dev web \
       serve serve-all build test lint clean \
       db-migrate db-revert db-generate \
       test-e2e-infra test-e2e-infra-down test-e2e \
       wipe-vectors flush-kafka

export NX_TUI                  := false
export NX_PROJECT_GRAPH_LAUNCH := false

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Dependencies ──────────────────────────────────────────────

install: ## Install all dependencies
	pnpm install

# ── Infrastructure ────────────────────────────────────────────

infra: ## Start infrastructure (Postgres, Weaviate, Redpanda)
	docker compose up -d

infra-down: ## Stop infrastructure
	docker compose down

infra-logs: ## Tail infrastructure logs
	docker compose logs -f

# ── Services ──────────────────────────────────────────────────

backend: ## Start backend API in dev mode
	npx nx serve backend

agent: ## Start agent service in dev mode
	npx nx serve agent

agent-dev: ## Start agent-dev service in dev mode
	npx nx serve agent-dev

web: ## Start web UI in dev mode (http://localhost:4300)
	npx nx serve web

serve: ## Start backend + agent in parallel
	npx nx run-many -t serve -p backend agent

serve-all: ## Start backend + agent + web UI in parallel
	npx nx run-many -t serve -p backend agent web

serve-dev: ## Start backend + agent + web UI in dev mode in parallel
	npx nx run-many -t serve-dev -p backend agent-dev web

# ── Database Migrations ──────────────────────────────────────

TYPEORM_CLI = TS_NODE_PROJECT=apps/backend/tsconfig.app.json npx typeorm-ts-node-commonjs
DATASOURCE  = -d apps/backend/src/data-source.ts

db-migrate: ## Run pending migrations
	$(TYPEORM_CLI) migration:run $(DATASOURCE)

db-revert: ## Revert last migration
	$(TYPEORM_CLI) migration:revert $(DATASOURCE)

db-generate: ## Generate migration from entity changes (usage: make db-generate NAME=AddFoo)
	$(TYPEORM_CLI) migration:generate apps/backend/src/migrations/$${NAME:-NewMigration} $(DATASOURCE)

# ── Build / Test ──────────────────────────────────────────────

build: ## Build all projects
	npx nx run-many -t build

test: ## Run all tests
	npx nx run-many -t test

lint: ## Format with prettier
	npx prettier --write .

clean: ## Remove dist output
	rm -rf dist

# ── Data Management ──────────────────────────────────────────

wipe-vectors: ## Delete and recreate the Weaviate FileChunks collection
	@echo "Wiping FileChunks collection..."
	@curl -sf -X DELETE http://localhost:8080/v1/schema/FileChunks || true
	@echo "Done. Collection will be recreated on next agent startup."

flush-kafka: ## Delete and recreate all Kafka topics
	docker compose exec redpanda rpk topic delete file.uploaded file.ready file.failed file.extracted chat.request dlq.file.uploaded dlq.file.extracted dlq.chat.request --brokers localhost:9092 || true
	docker compose exec redpanda rpk topic create file.uploaded file.ready file.failed file.extracted chat.request dlq.file.uploaded dlq.file.extracted dlq.chat.request --brokers localhost:9092 || true

# ── E2E Tests ────────────────────────────────────────────────

test-e2e-infra: ## Start E2E test infrastructure (stops dev infra first)
	docker compose down
	docker compose -p files-assistant-test -f docker-compose.test.yml up -d --wait

test-e2e-infra-down: ## Stop E2E test infrastructure
	docker compose -p files-assistant-test -f docker-compose.test.yml down -v

test-e2e: test-e2e-infra ## Run E2E ingestion tests (auto-starts test infra)
	npx nx e2e backend-e2e