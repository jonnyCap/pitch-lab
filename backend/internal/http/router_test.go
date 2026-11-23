package http

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func TestHealthEndpoints(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		dbErr  error
		status int
	}{
		{"live ok", "/healthz", nil, http.StatusOK},
		{"live ignores db", "/healthz", errors.New("down"), http.StatusOK},
		{"ready ok", "/readyz", nil, http.StatusOK},
		{"ready db down", "/readyz", errors.New("down"), http.StatusServiceUnavailable},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewRouter(Deps{
				Log:         slog.New(slog.NewTextHandler(io.Discard, nil)),
				DB:          fakeDB{err: tc.dbErr},
				CORSOrigins: []string{"http://localhost:5173"},
			})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestCORSPreflight(t *testing.T) {
	h := NewRouter(Deps{
		Log:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		DB:          fakeDB{},
		CORSOrigins: []string{"https://pitchlab.cloud-test.dev"},
	})
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", "https://pitchlab.cloud-test.dev")
	req.Header.Set("Access-Control-Request-Method", "GET")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://pitchlab.cloud-test.dev" {
		t.Fatalf("allow-origin = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("allow-credentials = %q", got)
	}
}
