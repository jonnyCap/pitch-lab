-- +goose Up
-- All objects live in the schema selected via search_path (POSTGRES_SCHEMA).

CREATE TABLE users (
    id                uuid PRIMARY KEY,
    email             text NOT NULL,
    password_hash     text NOT NULL,
    email_verified_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- Rotating opaque refresh tokens; only the SHA-256 hash is stored.
-- family_id groups a rotation chain so reuse of an old token revokes the whole family.
CREATE TABLE refresh_tokens (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id   uuid NOT NULL,
    token_hash  bytea NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    rotated_at  timestamptz,
    revoked_at  timestamptz
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Email verification and password reset tokens (hashed, single use).
CREATE TABLE email_tokens (
    token_hash  bytea PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose     text NOT NULL CHECK (purpose IN ('verify', 'reset')),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_tokens_user_idx ON email_tokens (user_id, purpose);

CREATE TABLE training_sessions (
    id           uuid PRIMARY KEY,               -- client-generated
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    module       text NOT NULL,                  -- 'ap', 'notes', 'intervals', ...
    started_at   timestamptz NOT NULL,
    ended_at     timestamptz,
    active_ms    bigint NOT NULL DEFAULT 0,      -- training time excluding inactivity
    meta         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX training_sessions_user_idx ON training_sessions (user_id, started_at);

-- Append-only log of every response. id is a client-generated UUID so uploads are idempotent.
CREATE TABLE trials (
    id             uuid PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id     uuid,
    module         text NOT NULL,
    level_id       text NOT NULL,
    midi           smallint NOT NULL,
    pitch_class    smallint NOT NULL CHECK (pitch_class BETWEEN 0 AND 11),
    octave         smallint NOT NULL,
    timbre         text NOT NULL,
    is_distractor  boolean NOT NULL DEFAULT false,
    prev_midi      smallint,
    response       text NOT NULL,                -- '0'..'11', 'none' (not in set) or 'timeout'
    correct        boolean NOT NULL,
    semitone_error smallint,                     -- circular 0..6, null for none/timeout
    rt_ms          integer,
    deadline_ms    integer,
    feedback       boolean NOT NULL,
    ts             timestamptz NOT NULL,
    received_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trials_user_ts_idx ON trials (user_id, ts);
CREATE INDEX trials_user_level_idx ON trials (user_id, level_id);

-- Versioned per-user JSON documents (ap_progress, srs, settings, ...).
CREATE TABLE state_docs (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key        text NOT NULL,
    version    bigint NOT NULL,
    doc        jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

CREATE TABLE test_results (
    id          uuid PRIMARY KEY,                -- client-generated
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind        text NOT NULL,                   -- 'pretest', 'weekly', 'retention_1m', ...
    taken_at    timestamptz NOT NULL,
    metrics     jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_results_user_idx ON test_results (user_id, taken_at);

-- +goose Down
DROP TABLE test_results;
DROP TABLE state_docs;
DROP TABLE trials;
DROP TABLE training_sessions;
DROP TABLE email_tokens;
DROP TABLE refresh_tokens;
DROP TABLE users;
