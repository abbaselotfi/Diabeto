# Iran drug extractor follow-up

Do not port these changes yet. Finish the current GLYMIZE extraction/matching debug cycle first, then apply the proven fixes to the separate extraction project discussed in:

https://chatgpt.com/share/6a763a47-3d84-83eb-8af1-0369c3a7921b

## Fixes to carry over after this cycle is complete

- Provider-specific exact header mappings for IHIO, Armed Forces/SATA and Social Security.
- Decimal-safe Persian/Arabic numeric parsing.
- IHIO coverage fallback from insurer amount / accepted total, with explicit-percent fallback only when a percent sign is present.
- Non-blocking handling for an isolated IHIO row whose coverage cannot be derived; never invent a percentage.
- SATA ordinary-patient-share fraction -> organization coverage complement.
- Never treat insurer monetary columns as consumer retail price.
- Correct physical row numbering in diagnostics.
- Canonical numeric generic-code normalization (for example 01523 == 1523 == 001523).
- Prefer authoritative NFI generic identity over the original seed/search query when available.
- Prevent component drugs from being inherited into fixed-dose combination identities by substring matching.
- Cross-insurer generic-code consensus for correcting bad NFI/search identity matches.
- Four-source consensus standardization: one vote per independent official source, 3/4 quorum may correct an outlier; two agreeing sources may fill missing standardized data when no confident source conflicts, and may correct only a single low-confidence dissent.
- Preserve raw source provenance and an audit trail for every automatic correction.
- Recover dosage form/strength conservatively from official insurer labels when structured columns are absent.
- Presentation resolver rules for IR vs ER/XR/MR, insulin U-concentrations including `[iU]` notation, premix ratios, and pen total-content vs delivered-dose descriptions.
- Master Drug Registry separation: do not reject a drug solely because it is outside the diabetes-only scope; distinguish identity, clinical-domain classification and clinical-engine eligibility.

## Reminder

At the end of the current GLYMIZE import/debugging work, explicitly remind the user to port this finalized set of fixes to the linked extraction project so both pipelines produce more consistent output.
