# Pitch Lab API
BIN     ?= $(CURDIR)/bin
GO      ?= go
DB_CTR  ?= pitch-lab-db-1
GOMODCACHE := $(shell $(GO) env GOMODCACHE)
TEST_DB_URL ?= postgres://pitchlab:pitchlab@127.0.0.1:5432/pitchlab?sslmode=disable
GOOSE   := $(GO) run github.com/pressly/goose/v3/cmd/goose@v3.30.1

.PHONY: all build run test test-integration vet fmt tidy lint migrate-new clean help

all: fmt vet test build

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-18s %s\n", $$1, $$2}'

build: ## build the server binary into ./bin
	@mkdir -p $(BIN)
	CGO_ENABLED=0 $(GO) build -trimpath -o $(BIN)/server ./cmd/server

test: ## unit tests (integration tests skip without TEST_DATABASE_URL)
	$(GO) test -race ./...

# Runs inside the network namespace of the compose Postgres container. This works
# even when a VPN blocks Docker bridge networking / host port forwarding.
test-integration: ## all tests against the docker-compose Postgres (make -C .. db first)
	docker run --rm --network container:$(DB_CTR) \
		-v "$(CURDIR)":/src -v "$(GOMODCACHE)":/go/pkg/mod:ro -w /src \
		-e GOPROXY=off -e GOFLAGS=-mod=mod -e TEST_DATABASE_URL='$(TEST_DB_URL)' \
		golang:1.26-alpine go test -count=1 ./...

vet: ## go vet
	$(GO) vet ./...

fmt: ## gofmt
	gofmt -w .

tidy: ## go mod tidy
	$(GO) mod tidy

lint: ## golangci-lint (via go run)
	$(GO) run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.6.2 run ./...

migrate-new: ## create a new SQL migration: make migrate-new NAME=add_foo
	$(GOOSE) -dir internal/db/migrations create $(NAME) sql

clean:
	rm -rf $(BIN)
