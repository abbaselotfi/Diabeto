-- Imported global medicine reference records. These are deliberately separate
-- from brand_market_entry: they must not be interpreted as an Iranian product
-- registry, availability record, or display preference.
CREATE TYPE reference_catalogue_review_state AS ENUM (
  'reference_only',
  'needs_iran_validation',
  'validated_for_iran',
  'rejected'
);

CREATE TABLE reference_catalogue_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_url text NOT NULL,
  purpose text NOT NULL,
  accessed_at date,
  source_file text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, source_file)
);

CREATE TABLE reference_medication_presentation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES reference_catalogue_source(id) ON DELETE RESTRICT,
  therapeutic_class text NOT NULL,
  mechanism_or_subclass text NOT NULL,
  generic_name text NOT NULL,
  administration_route text NOT NULL,
  dosage_form text NOT NULL,
  strength_presentation text NOT NULL,
  sample_label_frequency text,
  sample_brands text,
  indication_scope text,
  source_market_status text,
  source_url text NOT NULL,
  coverage_notes text,
  source_observed_at date NOT NULL,
  review_state reference_catalogue_review_state NOT NULL DEFAULT 'needs_iran_validation',
  reviewed_by uuid REFERENCES user_account(id),
  reviewed_at timestamptz,
  iran_validation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((review_state IN ('reference_only', 'needs_iran_validation')) OR reviewed_at IS NOT NULL),
  UNIQUE (source_id, generic_name, dosage_form, strength_presentation, source_url)
);

CREATE INDEX reference_medication_presentation_review_lookup
  ON reference_medication_presentation (review_state, generic_name);

-- Per-organization checklist state. In the current API prototype this is
-- held in memory; production must persist it here and audit every change.
CREATE TABLE organization_reference_medication_visibility (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  reference_medication_presentation_id uuid NOT NULL REFERENCES reference_medication_presentation(id) ON DELETE CASCADE,
  show_in_app boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES user_account(id),
  PRIMARY KEY (organization_id, reference_medication_presentation_id)
);

-- Promotion workflow:
-- 1) Admin reviews a reference row against authorised Iranian evidence.
-- 2) Admin creates generic_medication / manufacturer / brand and a separate
--    brand_market_entry with market='IR'.
-- 3) No UI or clinical engine may use this staging table to make a market or
--    treatment claim.
