from __future__ import annotations

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

    def test_known_bromocriptine_identity_conflict_is_preserved_as_master_candidate(self) -> None:
        finalized = finalize_bundle(self.base_bundle())
        self.assertEqual(finalized["run"]["status"], "ready_to_publish")
        self.assertEqual(finalized["run"]["summary"]["ambiguousMatchCount"], 0)
        self.assertEqual(len(finalized["records"]), 1)
        self.assertEqual(len(finalized["masterCandidates"]), 1)
        candidate = finalized["masterCandidates"][0]
        self.assertEqual(candidate["genericName"], "Bromocriptine")
        self.assertEqual(candidate["originalGenericName"], "Bromocriptine-QR")
        self.assertEqual(candidate["clinicalDomains"], [])
        self.assertEqual(candidate["identityDisposition"], "preserved_for_master_registry")

    def test_unknown_low_confidence_record_still_blocks_finalization(self) -> None:
        bundle = self.base_bundle()
        bundle["records"][1]["genericName"] = "Unknown Drug"
        with self.assertRaises(ValueError):
            finalize_bundle(bundle)


if __name__ == "__main__":
    unittest.main()
