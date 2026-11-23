package db

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// Integration test: requires TEST_DATABASE_URL (e.g. the docker-compose Postgres).
func TestMigrateRoundTrip(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	const schema = "pitchlab_test"
	pool, err := Open(ctx, url, schema)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DROP SCHEMA IF EXISTS "+schema+" CASCADE") })

	if err := Migrate(ctx, pool, schema); err != nil {
		t.Fatalf("first up: %v", err)
	}
	// Idempotent: second run is a no-op.
	if err := Migrate(ctx, pool, schema); err != nil {
		t.Fatalf("second up: %v", err)
	}

	assertTable(t, pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", schema+".trials").Scan, true)

	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, mustSub(migrations, "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.DownTo(ctx, 0); err != nil {
		t.Fatalf("down to 0: %v", err)
	}
	assertTable(t, pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", schema+".trials").Scan, false)

	if err := Migrate(ctx, pool, schema); err != nil {
		t.Fatalf("up after down: %v", err)
	}
}

func assertTable(t *testing.T, scan func(...any) error, want bool) {
	t.Helper()
	var exists bool
	if err := scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != want {
		t.Fatalf("table exists = %v, want %v", exists, want)
	}
}
