-- GLYMIZE V1: anonymous clinical sessions only. No patient identifiers or
-- clinical inputs are stored in this migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE brand_availability AS ENUM ('active', 'unavailable', 'discontinued', 'unknown');
CREATE TYPE catalog_review_state AS ENUM ('candidate', 'in_review', 'published', 'rejected', 'retired');
CREATE TYPE display_mode AS ENUM ('generic_first', 'brand_first');
CREATE TYPE import_source_kind AS ENUM ('official_registry', 'approved_export', 'manual_csv');

CREATE TABLE organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  phone_e164 text,
  medical_license_number text,
  registration_state text NOT NULL DEFAULT 'requested' CHECK (registration_state IN ('requested', 'phone_verified', 'license_pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone_e164),
  UNIQUE (organization_id, medical_license_number)
);

CREATE TABLE generic_medication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  persian_name text NOT NULL,
  atc_code text,
  clinical_class text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  UNIQUE (canonical_name)
);

CREATE TABLE manufacturer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  display_name_fa text,
  display_name_en text,
  UNIQUE (legal_name)
);

CREATE TABLE brand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_fa text,
  normalized_name text NOT NULL,
  UNIQUE (normalized_name)
);

CREATE TABLE brand_market_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_medication_id uuid NOT NULL REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  manufacturer_id uuid NOT NULL REFERENCES manufacturer(id) ON DELETE RESTRICT,
  market char(2) NOT NULL DEFAULT 'IR' CHECK (market = 'IR'),
  dosage_form text NOT NULL,
  strength_value numeric,
  strength_unit text,
  availability brand_availability NOT NULL DEFAULT 'unknown',
  review_state catalog_review_state NOT NULL DEFAULT 'candidate',
  valid_from timestamptz,
  valid_to timestamptz,
  source_url text NOT NULL,
  source_reference text NOT NULL,
  observed_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  UNIQUE (generic_medication_id, brand_id, manufacturer_id, market, dosage_form, strength_value, strength_unit, valid_from)
);

CREATE TABLE organization_display_setting (
  organization_id uuid PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  medication_display_mode display_mode NOT NULL DEFAULT 'generic_first',
  theme_key text NOT NULL DEFAULT 'glymize-default',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES user_account(id)
);

CREATE TABLE organization_brand_preference (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  generic_medication_id uuid NOT NULL REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_market_entry_id uuid NOT NULL REFERENCES brand_market_entry(id) ON DELETE RESTRICT,
  priority smallint NOT NULL CHECK (priority > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES user_account(id),
  PRIMARY KEY (organization_id, generic_medication_id, brand_market_entry_id),
  UNIQUE (organization_id, generic_medication_id, priority)
);

CREATE TABLE catalog_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES user_account(id),
  source_kind import_source_kind NOT NULL,
  source_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'needs_review', 'published', 'failed', 'blocked')),
  source_checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (source_kind = 'manual_csv' OR source_url IS NOT NULL)
);

CREATE TABLE usage_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  actor_pseudonym uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('session_started', 'pathway_selected', 'assessment_started', 'assessment_completed')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  app_version text NOT NULL,
  -- This table intentionally has no patient identifier, clinical data, or free text.
  UNIQUE (organization_id, actor_pseudonym, event_type, occurred_at)
);

CREATE TABLE daily_usage_aggregate (
  organization_id uuid NOT NULL REFERENCES organization(id),
  local_date date NOT NULL,
  metric_key text NOT NULL,
  metric_definition_version text NOT NULL,
  value integer NOT NULL CHECK (value >= 0),
  PRIMARY KEY (organization_id, local_date, metric_key, metric_definition_version)
);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organization(id),
  actor_id uuid REFERENCES user_account(id),
  action text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  redacted_diff jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX brand_market_entry_lookup ON brand_market_entry (generic_medication_id, market, availability, review_state);
CREATE INDEX usage_event_organization_time ON usage_event (organization_id, occurred_at, event_type);
CREATE INDEX audit_event_organization_time ON audit_event (organization_id, occurred_at DESC);

-- The API must run every tenant-scoped request in a transaction that executes
-- SET LOCAL app.organization_id = '<verified organization UUID>'.
CREATE FUNCTION current_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid;
$$;

ALTER TABLE user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_display_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_brand_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage_aggregate ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_account_tenant ON user_account USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY display_setting_tenant ON organization_display_setting USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY brand_preference_tenant ON organization_brand_preference USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY usage_event_tenant ON usage_event USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY daily_usage_tenant ON daily_usage_aggregate USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY audit_event_tenant ON audit_event USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
