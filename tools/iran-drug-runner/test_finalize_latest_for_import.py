from __future__ import annotations

import copy
import unittest

from finalize_latest_for_import import finalize_bundle


class FinalizeLatestForImportTests(unittest.TestCase):
    @staticmethod
    def base_bundle() -> dict:
        return {
            "schemaVersion": 1,
            "run": {
                "id": "test-run",
                "schemaVersion": 1,
                "status": "needs_review",
                "startedAt": "2026-08-07T00:00:00+00:00",
                "sources": [
                    {"sourceId": "iran_fda_nfi", "status": "succeeded"},
                    {"sourceId": "health_insurance", "status": "succeeded"},
                    {"sourceId": "armed_forces", "status": "succeeded"},
                    {"sourceId": "social_security", "status": "succeeded"},
                ],
                "summary": {
                    "genericCount": 2,
                    "brandCount": 2,
                    "priceChangeCount": 2,
                    "coverageChangeCount": 0,
                    "ambiguousMatchCount": 1,
                    "errorCount": 0,
                    "warningCount": 1,
                },
            },
            "records": [
                {
                    "genericName": "Metformin",
                    "brandName": "TEST METFORMIN",
                    "brandRegistryCode": "1111111111111111",
                    "dosageForm": "TABLET",
                    "strengthPresentation": "500 mg",
                    "clinicalDomains": ["diabetes"],
                    "insuranceCoverages": [],
                    "sourceUrl": "https://irc.fda.gov.ir/nfi",
                    "sourceReference": "Iran FDA NFI",
                    "observedAt": "2026-08-07T00:00:00+00:00",
                    "matchConfidence": 0.99,
                },
                {
                    "genericName": "Bromocriptine-QR",
                    "brandName": "بروموزیت-آی اچ",
                    "brandRegistryCode": "7928395533134065",
                    "dosageForm": "TABLET",
                    "strengthPresentation": "2.5 mg",
                    "clinicalDomains": ["diabetes"],
                    "insuranceCoverages": [],
                    "sourceUrl": "https://irc.fda.gov.ir/nfi",
                    "sourceReference": "Iran FDA NFI",
                    "observedAt": "2026-08-07T00:00:00+00:00",
                    "matchConfidence": 0.89,
                },
            ],
        }

    def bundle_with_records(self, records: list[dict]) -> dict:
        bundle = copy.deepcopy(self.base_bundle())
        bundle["records"] = records
        bundle["run"]["summary"]["ambiguousMatchCount"] = 0
        return bundle

    @staticmethod
    def record(generic: str, form: str, strength: str) -> dict:
        return {
            "genericName": generic,
            "brandName": f"TEST {generic}",
            "brandRegistryCode": "1234567890123456",
            "dosageForm": form,
            "strengthPresentation": strength,
            "clinicalDomains": ["diabetes"],
            "insuranceCoverages": [],
            "sourceUrl": "https://irc.fda.gov.ir/nfi",
            "sourceReference": "Iran FDA NFI",
            "observedAt": "2026-08-07T00:00:00+00:00",
            "matchConfidence": 0.99,
        }

    def test_known_bromocriptine_identity_conflict_is_preserved_as_master_candidate(self) -> None:
        finalized = finalize_bundle(self.base_bundle())
        self.assertEqual(finalized["run"]["status"], "ready_to_publish")
        self.assertEqual(finalized["run"]["summary"]["ambiguousMatchCount"], 0)
        self.assertEqual(len(finalized["records"]), 1)
        self.assertEqual(finalized["records"][0]["referencePresentationId"], "global-metformin-1")
        self.assertEqual(len(finalized["masterCandidates"]), 1)
        candidate = finalized["masterCandidates"][0]
        self.assertEqual(candidate["genericName"], "Bromocriptine")
        self.assertEqual(candidate["originalGenericName"], "Bromocriptine-QR")
        self.assertEqual(candidate["clinicalDomains"], [])
        self.assertEqual(candidate["identityDisposition"], "preserved_for_master_registry")
        self.assertNotIn("referencePresentationId", candidate)

    def test_unknown_low_confidence_record_still_blocks_finalization(self) -> None:
        bundle = self.base_bundle()
        bundle["records"][1]["genericName"] = "Unknown Drug"
        with self.assertRaises(ValueError):
            finalize_bundle(bundle)

    def test_regular_human_insulin_u100_and_u500_resolve_to_different_presentations(self) -> None:
        records = [
            self.record("Regular human insulin", "INJECTION, SOLUTION", "100 IU/mL"),
            self.record("Regular human insulin", "INJECTION, SOLUTION", "500 IU/mL"),
        ]
        finalized = finalize_bundle(self.bundle_with_records(records))
        self.assertEqual(
            [record["referencePresentationId"] for record in finalized["records"]],
            ["global-regular-human-insulin-1", "global-regular-human-insulin-2"],
        )

    def test_metformin_release_form_resolves_ir_vs_er(self) -> None:
        records = [
            self.record("Metformin", "TABLET", "500 mg"),
            self.record("Metformin", "TABLET, EXTENDED RELEASE", "500 mg"),
        ]
        finalized = finalize_bundle(self.bundle_with_records(records))
        self.assertEqual(
            [record["referencePresentationId"] for record in finalized["records"]],
            ["global-metformin-1", "global-metformin-2"],
        )

    def test_gliclazide_strength_and_release_resolve_ir_vs_mr(self) -> None:
        records = [
            self.record("Gliclazide", "TABLET", "80 mg"),
            self.record("Gliclazide", "TABLET, EXTENDED RELEASE", "60 mg"),
        ]
        finalized = finalize_bundle(self.bundle_with_records(records))
        self.assertEqual(
            [record["referencePresentationId"] for record in finalized["records"]],
            ["global-gliclazide-1", "global-gliclazide-2"],
        )

    def test_semaglutide_total_pen_content_resolves_to_injectable_presentation(self) -> None:
        records = [
            self.record("Semaglutide", "INJECTION, SOLUTION", "4 mg/3 mL"),
            self.record("Semaglutide", "INJECTION, SOLUTION", "8 mg/3 mL"),
        ]
        finalized = finalize_bundle(self.bundle_with_records(records))
        self.assertEqual(
            [record["referencePresentationId"] for record in finalized["records"]],
            ["global-semaglutide-2", "global-semaglutide-2"],
        )

    def test_internal_slash_in_generic_name_is_not_split_as_language_separator(self) -> None:
        record = self.record(
            "Human insulin isophane/regular",
            "INJECTION, SUSPENSION",
            "70/30 100 IU/mL",
        )
        finalized = finalize_bundle(self.bundle_with_records([record]))
        self.assertEqual(
            finalized["records"][0]["referencePresentationId"],
            "global-human-insulin-isophane-1",
        )

    def test_high_confidence_record_without_reference_still_blocks_finalization(self) -> None:
        record = self.record("Uncatalogued Example", "TABLET", "10 mg")
        with self.assertRaises(ValueError):
            finalize_bundle(self.bundle_with_records([record]))


if __name__ == "__main__":
    unittest.main()
