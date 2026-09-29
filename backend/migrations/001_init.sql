-- ============================================================
-- PUSEWU Member Portal — PostgreSQL schema
-- Migration 001: initial schema
-- ============================================================

BEGIN;

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---- Enumerated types --------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('member','officer','finance','rep','admin','exec');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('pending','paid','at-risk','lost','withdrawn','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('pending_review','approved','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE case_status AS ENUM ('received','under_review','in_negotiation','resolved','closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE retirement_mode AS ENUM ('percent','fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- updated_at helper -------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- users: every login of any role
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  role           user_role NOT NULL DEFAULT 'member',
  password_hash  TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  surname        TEXT NOT NULL,
  job_title      TEXT,
  branch         TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique email (lower-cased index avoids the citext extension).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- members: member-specific profile (1:1 with a user of role 'member')
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  member_no          TEXT UNIQUE,
  nrc                TEXT NOT NULL,
  phone              TEXT,
  ministry           TEXT,
  station            TEXT,
  employee_no        TEXT,
  job_title          TEXT,
  branch             TEXT,
  basic_pay          NUMERIC(12,2),
  status             membership_status NOT NULL DEFAULT 'pending',
  joined_on          DATE,
  first_contribution DATE,
  signed_name        TEXT,
  signed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_status_idx  ON members(status);
CREATE INDEX IF NOT EXISTS members_ministry_idx ON members(ministry);
CREATE INDEX IF NOT EXISTS members_branch_idx  ON members(branch);

DROP TRIGGER IF EXISTS trg_members_updated ON members;
CREATE TRIGGER trg_members_updated BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- settings: single-row, editable by Finance (deduction model)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id               INT PRIMARY KEY DEFAULT 1,
  deduction_rate   NUMERIC(5,2),                 -- % of basic pay; NULL until configured
  retirement_mode  retirement_mode NOT NULL DEFAULT 'percent',
  retirement_share NUMERIC(7,2),                 -- % of deduction, or fixed amount
  deduction_code   TEXT NOT NULL DEFAULT 'F396',
  currency         TEXT NOT NULL DEFAULT 'K',
  configured       BOOLEAN NOT NULL DEFAULT false,
  updated_by       UUID REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- applications: membership applications awaiting officer approval
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref          TEXT UNIQUE NOT NULL,
  first_name   TEXT NOT NULL,
  surname      TEXT NOT NULL,
  nrc          TEXT NOT NULL,
  phone        TEXT,
  email        TEXT NOT NULL,
  ministry     TEXT,
  branch       TEXT,
  station      TEXT,
  employee_no  TEXT,
  job_title    TEXT,
  basic_pay    NUMERIC(12,2),
  switching    BOOLEAN NOT NULL DEFAULT false,
  prior_union  TEXT,
  signed_name  TEXT NOT NULL,
  signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       application_status NOT NULL DEFAULT 'pending_review',
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);

-- ============================================================
-- contributions: monthly PMEC deduction ledger per member
-- ============================================================
CREATE TABLE IF NOT EXISTS contributions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period         DATE NOT NULL,                 -- first day of the month
  basic_pay      NUMERIC(12,2),
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- total deduction
  retirement     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- portion to retirement
  paid           BOOLEAN NOT NULL DEFAULT false,
  source         TEXT DEFAULT 'pmec',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, period)
);
CREATE INDEX IF NOT EXISTS contributions_member_idx ON contributions(member_id);

-- ============================================================
-- cases: member grievances / issues + status timeline
-- ============================================================
CREATE TABLE IF NOT EXISTS cases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref          TEXT UNIQUE NOT NULL,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  detail       TEXT,
  status       case_status NOT NULL DEFAULT 'received',
  officer      TEXT,
  sla          TEXT,
  opened_on    DATE NOT NULL DEFAULT current_date,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_member_idx ON cases(member_id);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status);

DROP TRIGGER IF EXISTS trg_cases_updated ON cases;
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS case_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events(case_id);

-- ============================================================
-- loans and welfare claims
-- ============================================================
CREATE TABLE IF NOT EXISTS loans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref         TEXT UNIQUE NOT NULL,
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  term        TEXT,
  purpose     TEXT,
  status      TEXT NOT NULL DEFAULT 'submitted',
  applied_on  DATE NOT NULL DEFAULT current_date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loans_member_idx ON loans(member_id);

CREATE TABLE IF NOT EXISTS welfare_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT UNIQUE NOT NULL,
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 2000,
  relationship  TEXT,
  deceased_name TEXT,
  status        TEXT NOT NULL DEFAULT 'under_review',
  filed_on      DATE NOT NULL DEFAULT current_date,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS welfare_member_idx ON welfare_claims(member_id);

-- ============================================================
-- trainings and RSVPs
-- ============================================================
CREATE TABLE IF NOT EXISTS trainings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  place       TEXT,
  event_date  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_rsvps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id  UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_id, member_id)
);

-- ============================================================
-- case_library: anonymised resolved cases (learning resource)
-- ============================================================
CREATE TABLE IF NOT EXISTS case_library (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,
  ministry   TEXT,
  outcome    TEXT,
  title      TEXT NOT NULL,
  basis      TEXT,
  summary    TEXT,
  lesson     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- audit_log: record of sensitive actions
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_log(actor_id);

-- Ensure a settings row exists
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
