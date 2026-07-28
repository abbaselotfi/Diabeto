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

-- Promotion workflow:
-- 1) Admin reviews a reference row against authorised Iranian evidence.
-- 2) Admin creates generic_medication / manufacturer / brand and a separate
--    brand_market_entry with market='IR'.
-- 3) No UI or clinical engine may use this staging table to make a market or
--    treatment claim.
