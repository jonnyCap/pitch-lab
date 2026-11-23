// Command server runs the Pitch Lab API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jonnycap/pitch-lab/backend/internal/config"
	"github.com/jonnycap/pitch-lab/backend/internal/db"
	apihttp "github.com/jonnycap/pitch-lab/backend/internal/http"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	startCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	pool, err := db.Open(startCtx, cfg.DatabaseURL, cfg.PostgresSchema)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := db.Migrate(startCtx, pool, cfg.PostgresSchema); err != nil {
		return err
	}
	log.Info("migrations applied", "schema", cfg.PostgresSchema)

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: apihttp.NewRouter(apihttp.Deps{
			Log:         log,
			DB:          pool,
			CORSOrigins: cfg.CORSOrigins,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	return srv.Shutdown(shutdownCtx)
}
