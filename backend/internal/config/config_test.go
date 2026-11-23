package config

import "testing"

func TestLoad(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost:5432/pitchlab")
	t.Setenv("SECRET_KEY", "0123456789abcdef0123456789abcdef")
	t.Setenv("CORS_ORIGINS", " https://a.dev , https://b.dev ,")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.PostgresSchema != "pitchlab" || c.Addr != ":8080" {
		t.Fatalf("defaults not applied: %+v", c)
	}
	if len(c.CORSOrigins) != 2 || c.CORSOrigins[1] != "https://b.dev" {
		t.Fatalf("CORS_ORIGINS parsed as %q", c.CORSOrigins)
	}
}

func TestLoadRejectsInvalid(t *testing.T) {
	tests := map[string]map[string]string{
		"missing db":   {"DATABASE_URL": "", "SECRET_KEY": "0123456789abcdef0123456789abcdef"},
		"short secret": {"DATABASE_URL": "postgres://x", "SECRET_KEY": "short"},
		"bad schema":   {"DATABASE_URL": "postgres://x", "SECRET_KEY": "0123456789abcdef0123456789abcdef", "POSTGRES_SCHEMA": "x; DROP"},
	}
	for name, env := range tests {
		t.Run(name, func(t *testing.T) {
			for k, v := range env {
				t.Setenv(k, v)
			}
			if _, err := Load(); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
