.PHONY: help install infra infra-down infra-logs \
       backend agent agent-dev \
       serve build test lint clean \
       db-migrate db-revert db-generate

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

serve: ## Start backend + agent in parallel
	npx nx run-many -t serve -p backend agent

# ── Database Migrations ──────────────────────────────────────

TYPEORM_CLI = npx typeorm-ts-node-commonjs
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
