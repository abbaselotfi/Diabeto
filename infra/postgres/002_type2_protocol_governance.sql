-- Type 2 protocol governance. Clinical rules are stored as a reviewable,
-- versioned bundle, never as an untracked change in application code.
CREATE TYPE clinical_protocol_status AS ENUM ('draft', 'in_review', 'approved', 'retired');
CREATE TYPE clinical_protocol_scope AS ENUM ('treatment_initiation', 'treatment_intensification', 'insulin_pathway');

CREATE TABLE clinical_protocol_bundle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diabetes_type text NOT NULL CHECK (diabetes_type = 'type_2'),
  scope clinical_protocol_scope NOT NULL,
  title text NOT NULL,
  semantic_version text NOT NULL,
  status clinical_protocol_status NOT NULL DEFAULT 'draft',
  source_url text NOT NULL,
  source_reference text NOT NULL,
  source_published_at date NOT NULL,
  rule_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  clinical_reviewer_id uuid REFERENCES user_account(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diabetes_type, scope, semantic_version),
  CHECK ((status = 'approved') = (clinical_reviewer_id IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE medication_catalog_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind import_source_kind NOT NULL,
  source_url text,
  source_reference text NOT NULL,
  license_or_permission_reference text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  checksum text,
  created_by uuid REFERENCES user_account(id),
  CHECK (source_kind = 'manual_csv' OR source_url IS NOT NULL)
);

ALTER TABLE generic_medication ADD COLUMN therapy_group text;
ALTER TABLE generic_medication ADD COLUMN administration_route text;
ALTER TABLE generic_medication ADD COLUMN source_id uuid REFERENCES medication_catalog_source(id);

CREATE INDEX clinical_protocol_bundle_lookup ON clinical_protocol_bundle (diabetes_type, scope, status, approved_at DESC);
