from __future__ import annotations

import unittest

from source_consensus import apply_identity_consensus, apply_reference_consensus


class SourceConsensusTests(unittest.TestCase):
    @staticmethod
    def nfi(name: str, code: str, confidence: float = 0.99, reference_id: str | None = None) -> dict:
        record = {
            "genericName": name,
            "genericRegistryCode": code,
            "clinicalDomains": ["diabetes"],
            "insuranceCoverages": [],
            "sourceUrl": "https://irc.fda.gov.ir/nfi",
            "sourceReference": "NFI",
            "matchConfidence": confidence,
        }
        if reference_id:
            record["referencePresentationId"] = reference_id
        return record

    @staticmethod
    def insurer(provider: str, name: str, code: str, confidence: float = 0.99, reference_id: str | None = None) -> dict:
        record = {
            "genericName": name,
            "clinicalDomains": ["diabetes"],
            "insuranceCoverages": [{"provider": provider, "percent": 70, "genericCode": code}],
            "sourceUrl": "https://example.invalid",
            "sourceReference": provider,
            "matchConfidence": confidence,
        }
        if reference_id:
            record["referencePresentationId"] = reference_id
        return record

    def test_three_of_four_identity_votes_correct_outlier(self) -> None:
        bundle = {
            "records": [
                self.nfi("Metformin + gliclazide", "01523", 0.99),
                self.insurer("health_insurance", "Gliclazide", "1523"),
                self.insurer("armed_forces", "Gliclazide", "001523"),
                self.insurer("social_security", "Gliclazide", "1523"),
            ]
        }
        result = apply_identity_consensus(bundle)
        self.assertEqual(result["identityCorrections"], 1)
        self.assertTrue(all(record["genericName"] == "Gliclazide" for record in bundle["records"]))
        self.assertIn("four-source identity consensus", bundle["records"][0]["sourceReference"])

    def test_two_votes_do_not_override_confident_disagreement(self) -> None:
        bundle = {
            "records": [
                self.nfi("Metformin", "100", 0.99),
                self.insurer("health_insurance", "Metformin", "100", 0.99),
                self.insurer("armed_forces", "Metformin ER", "100", 0.99),
            ]
        }
        result = apply_identity_consensus(bundle)
        self.assertEqual(result["identityCorrections"], 0)
        self.assertEqual(bundle["records"][2]["genericName"], "Metformin ER")

    def test_two_votes_can_correct_one_low_confidence_dissent(self) -> None:
        bundle = {
            "records": [
                self.nfi("Wrong seed", "100", 0.7),
                self.insurer("health_insurance", "Metformin", "100"),
                self.insurer("armed_forces", "Metformin", "100"),
            ]
        }
        result = apply_identity_consensus(bundle)
        self.assertEqual(result["identityCorrections"], 1)
        self.assertEqual(bundle["records"][0]["genericName"], "Metformin")

    def test_two_nonconflicting_reference_votes_fill_missing_sources(self) -> None:
        records = [
            self.nfi("Metformin", "100", reference_id="global-metformin-1"),
            self.insurer("health_insurance", "Metformin", "100", reference_id="global-metformin-1"),
            self.insurer("armed_forces", "Metformin", "100"),
            self.insurer("social_security", "Metformin", "100"),
        ]
        result = apply_reference_consensus(records)
        self.assertEqual(result["presentationIdsFilled"], 2)
        self.assertTrue(all(record["referencePresentationId"] == "global-metformin-1" for record in records))

    def test_three_reference_votes_correct_single_outlier(self) -> None:
        records = [
            self.nfi("Insulin glargine", "200", reference_id="global-insulin-glargine-1"),
            self.insurer("health_insurance", "Insulin glargine", "200", reference_id="global-insulin-glargine-1"),
            self.insurer("armed_forces", "Insulin glargine", "200", reference_id="global-insulin-glargine-1"),
            self.insurer("social_security", "Insulin glargine", "200", reference_id="global-insulin-glargine-2"),
        ]
        result = apply_reference_consensus(records)
        self.assertEqual(result["presentationIdsCorrected"], 1)
        self.assertTrue(all(record["referencePresentationId"] == "global-insulin-glargine-1" for record in records))


if __name__ == "__main__":
    unittest.main()
