-- Versioned Iranian registry, price and insurance data. Raw snapshots are
-- immutable; admin changes are overlays and never rewrite source evidence.
CREATE TYPE drug_data_source_id AS ENUM (
  'iran_fda_nfi',
  'health_insurance',
  'armed_forces',
  'social_security'
);

CREATE TYPE drug_data_run_status AS ENUM (
  'staging',
  'needs_review',
  'ready_to_publish',
  'published',
  'failed'
);

CREATE TYPE drug_source_status AS ENUM (
  'pending',
  'running',
  'succeeded',
  'failed',
  'needs_review'
);

CREATE TYPE insurance_provider_id AS ENUM (
  'social_security',
  'health_insurance',
  'armed_forces',
  'other_organizations',
  'supplementary'
);

CREATE TYPE medication_clinical_domain AS ENUM (
  'diabetes',
  'cardiovascular',
  'kidney',
  'liver',
  'obesity'
);

CREATE TYPE medication_card_display_mode AS ENUM (
  'generic_or_primary_brand',
  'generic_with_selected_brands'
);

CREATE TABLE drug_data_update_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES user_account(id),
  status drug_data_run_status NOT NULL DEFAULT 'staging',
  runner_version text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  published_at timestamptz,
  previous_published_run_id uuid REFERENCES drug_data_update_run(id),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (published_at IS NULL OR status = 'published')
);

CREATE TABLE drug_data_source_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES drug_data_update_run(id) ON DELETE CASCADE,
  source_id drug_data_source_id NOT NULL,
  status drug_source_status NOT NULL DEFAULT 'pending',
  source_url text NOT NULL,
  observed_at timestamptz,
  completed_at timestamptz,
  row_count integer CHECK (row_count IS NULL OR row_count >= 0),
  checksum_sha256 text,
  original_filename text,
  storage_object_key text,
  error_code text,
  error_message text,
  UNIQUE (run_id, source_id)
);

CREATE TABLE raw_drug_source_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_id uuid NOT NULL REFERENCES drug_data_source_snapshot(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  source_record_key text,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_snapshot_id, source_row_number),
  UNIQUE (source_snapshot_id, payload_hash)
);

CREATE TABLE medication_source_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_id uuid NOT NULL REFERENCES drug_data_source_snapshot(id) ON DELETE RESTRICT,
  raw_record_id uuid NOT NULL REFERENCES raw_drug_source_record(id) ON DELETE RESTRICT,
  generic_medication_id uuid REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_market_entry_id uuid REFERENCES brand_market_entry(id) ON DELETE RESTRICT,
  match_confidence numeric(4,3) CHECK (match_confidence BETWEEN 0 AND 1),
  match_status text NOT NULL CHECK (match_status IN ('matched', 'ambiguous', 'unmatched', 'rejected')),
  match_method text NOT NULL,
  reviewed_by uuid REFERENCES user_account(id),
  reviewed_at timestamptz,
  review_note text,
  UNIQUE (source_snapshot_id, raw_record_id)
);

-- Codes are namespaced. A number called "drug code" by one insurer must never
-- silently replace an NFI/IRC/GTIN or another insurer's code.
CREATE TABLE medication_identifier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_medication_id uuid REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_market_entry_id uuid REFERENCES brand_market_entry(id) ON DELETE RESTRICT,
  provider insurance_provider_id,
  code_system text NOT NULL,
  code_value text NOT NULL,
  pack_description text,
  valid_from date,
  valid_to date,
  source_snapshot_id uuid NOT NULL REFERENCES drug_data_source_snapshot(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  CHECK (generic_medication_id IS NOT NULL OR brand_market_entry_id IS NOT NULL),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  UNIQUE NULLS NOT DISTINCT (provider, code_system, code_value, valid_from)
);

CREATE TABLE medication_price_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_medication_id uuid REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_market_entry_id uuid REFERENCES brand_market_entry(id) ON DELETE RESTRICT,
  price_kind text NOT NULL CHECK (price_kind IN ('consumer_retail', 'insurance_reference', 'unknown')),
  amount_toman bigint NOT NULL CHECK (amount_toman >= 0),
  source_amount numeric(18,2),
  source_currency text CHECK (source_currency IN ('IRR', 'TOMAN')),
  pack_description text,
  effective_at date,
  observed_at timestamptz NOT NULL,
  source_snapshot_id uuid NOT NULL REFERENCES drug_data_source_snapshot(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  CHECK (generic_medication_id IS NOT NULL OR brand_market_entry_id IS NOT NULL)
);

CREATE TABLE insurance_coverage_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_medication_id uuid REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_market_entry_id uuid REFERENCES brand_market_entry(id) ON DELETE RESTRICT,
  provider insurance_provider_id NOT NULL,
  generic_insurer_code text,
  brand_insurer_code text,
  coverage_percent numeric(5,2) CHECK (coverage_percent BETWEEN 0 AND 100),
  reference_price_toman bigint CHECK (reference_price_toman IS NULL OR reference_price_toman >= 0),
  insurer_share_toman bigint CHECK (insurer_share_toman IS NULL OR insurer_share_toman >= 0),
  patient_share_toman bigint CHECK (patient_share_toman IS NULL OR patient_share_toman >= 0),
  source_currency text CHECK (source_currency IN ('IRR', 'TOMAN')),
  source_reference_price numeric(18,2),
  source_insurer_share numeric(18,2),
  source_patient_share numeric(18,2),
  effective_at date,
  observed_at timestamptz NOT NULL,
  source_snapshot_id uuid NOT NULL REFERENCES drug_data_source_snapshot(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  CHECK (generic_medication_id IS NOT NULL OR brand_market_entry_id IS NOT NULL)
);

CREATE TABLE organization_medication_display_policy (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  generic_medication_id uuid NOT NULL REFERENCES generic_medication(id) ON DELETE RESTRICT,
  display_mode medication_card_display_mode NOT NULL DEFAULT 'generic_or_primary_brand',
  show_in_app boolean NOT NULL DEFAULT false,
  market_badge_key text,
  market_badge_label_fa text,
  market_badge_valid_until date,
  market_badge_confirmed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES user_account(id),
  PRIMARY KEY (organization_id, generic_medication_id)
);

CREATE TABLE organization_medication_domain (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  generic_medication_id uuid NOT NULL REFERENCES generic_medication(id) ON DELETE RESTRICT,
  domain medication_clinical_domain NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES user_account(id),
  PRIMARY KEY (organization_id, generic_medication_id, domain)
);

CREATE TABLE medication_admin_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  generic_medication_id uuid REFERENCES generic_medication(id) ON DELETE RESTRICT,
  brand_market_entry_id uuid REFERENCES brand_market_entry(id) ON DELETE RESTRICT,
  provider insurance_provider_id,
  field_key text NOT NULL,
  override_value jsonb NOT NULL,
  source_value_at_edit jsonb,
  source_snapshot_id_at_edit uuid REFERENCES drug_data_source_snapshot(id),
  needs_review boolean NOT NULL DEFAULT false,
  valid_until timestamptz,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES user_account(id),
  CHECK (generic_medication_id IS NOT NULL OR brand_market_entry_id IS NOT NULL)
);

CREATE TABLE admin_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'resolved')),
  title text NOT NULL,
  message text NOT NULL,
  action_href text,
  action_label text,
  source_run_id uuid REFERENCES drug_data_update_run(id),
  entity_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES user_account(id)
);

CREATE INDEX drug_source_snapshot_run ON drug_data_source_snapshot (run_id, source_id, status);
CREATE INDEX source_mapping_review ON medication_source_mapping (match_status, match_confidence);
CREATE INDEX medication_identifier_lookup ON medication_identifier (code_system, code_value, provider);
CREATE INDEX medication_price_current ON medication_price_snapshot (generic_medication_id, brand_market_entry_id, effective_at DESC, observed_at DESC);
CREATE INDEX insurance_coverage_current ON insurance_coverage_snapshot (provider, generic_medication_id, brand_market_entry_id, effective_at DESC);
CREATE INDEX admin_notification_open ON admin_notification (organization_id, status, severity, created_at DESC);

ALTER TABLE organization_medication_display_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_medication_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_admin_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY medication_display_policy_tenant ON organization_medication_display_policy USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY medication_domain_tenant ON organization_medication_domain USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY medication_override_tenant ON medication_admin_override USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
CREATE POLICY admin_notification_tenant ON admin_notification USING (organization_id = current_organization_id()) WITH CHECK (organization_id = current_organization_id());
