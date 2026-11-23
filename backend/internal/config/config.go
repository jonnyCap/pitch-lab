// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	PostgresSchema string
	SecretKey      string
	CORSOrigins    []string
	ResendAPIKey   string
	MailFrom       string
	PublicAppURL   string
}

var schemaName = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// Load reads configuration from the environment and validates it.
func Load() (Config, error) {
	c := Config{
		Addr:           getenv("ADDR", ":8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		PostgresSchema: getenv("POSTGRES_SCHEMA", "pitchlab"),
		SecretKey:      os.Getenv("SECRET_KEY"),
		CORSOrigins:    splitList(getenv("CORS_ORIGINS", "http://localhost:5173")),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		MailFrom:       getenv("MAIL_FROM", "Pitch Lab <noreply@cloud-test.dev>"),
		PublicAppURL:   getenv("PUBLIC_APP_URL", "http://localhost:5173"),
	}

	var errs []error
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	if !schemaName.MatchString(c.PostgresSchema) {
		errs = append(errs, fmt.Errorf("POSTGRES_SCHEMA %q is not a valid identifier", c.PostgresSchema))
	}
	if len(c.SecretKey) < 32 {
		errs = append(errs, errors.New("SECRET_KEY must be at least 32 characters"))
	}
	return c, errors.Join(errs...)
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
