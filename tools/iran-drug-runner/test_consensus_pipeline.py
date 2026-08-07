from __future__ import annotations

import unittest

from consensus_pipeline import _infer_dosage_form, _infer_strength


class ConsensusPipelineTests(unittest.TestCase):
    def test_extracts_tablet_strength_from_insurer_label(self) -> None:
        self.assertEqual(_infer_dosage_form("METFORMIN 500 MG TABLET ORAL"), "TABLET")
        self.assertEqual(_infer_strength("METFORMIN 500 MG TABLET ORAL"), "500 MG")

    def test_extracts_modified_release_form(self) -> None:
        self.assertEqual(
            _infer_dosage_form("GLICLAZIDE 60 MG TABLET EXTENDED RELEASE ORAL"),
            "TABLET, EXTENDED RELEASE",
        )
        self.assertEqual(_infer_strength("GLICLAZIDE 60 MG TABLET EXTENDED RELEASE ORAL"), "60 MG")

    def test_extracts_bracketed_insulin_concentration(self) -> None:
        self.assertEqual(_infer_strength("INSULIN GLARGINE 300 [iU]/1mL PEN"), "300 IU/1mL")
        self.assertEqual(_infer_dosage_form("INSULIN GLARGINE 300 [iU]/1mL PEN"), "PEN")


if __name__ == "__main__":
    unittest.main()
