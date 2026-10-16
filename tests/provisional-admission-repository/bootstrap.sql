-- Disposable synthetic database only; runner validates its exact local identity.
CREATE ROLE tll_provisional_migrator NOLOGIN CREATEROLE;
GRANT CREATE ON DATABASE tll_provisional_repository TO tll_provisional_migrator;
CREATE SCHEMA auth AUTHORIZATION tll_provisional_migrator;
SET SESSION AUTHORIZATION tll_provisional_migrator;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users SELECT ('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,20)i;
RESET SESSION AUTHORIZATION;
