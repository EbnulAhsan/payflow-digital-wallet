CREATE TABLE login_failures (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    failed_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX login_failures_user_failed_at_idx
ON login_failures(user_id, failed_at);

GRANT SELECT, INSERT, DELETE ON login_failures TO payflow_app;
GRANT USAGE, SELECT ON SEQUENCE login_failures_id_seq TO payflow_app;
