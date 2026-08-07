from __future__ import annotations

import unittest

from normalize_bundle_runtime import coverage_payload


class RuntimeCoverageFallbackTests(unittest.TestCase):
    def test_health_coverage_is_derived_from_official_amounts_when_percent_is_blank(self) -> None:
        headers = [
            "کد ژنريک",
            "کد برند",
            "عنوان",
            " درصد سهم سازمان با احتساب يارانه ارزي",
            " مبلغ سهم سازمان با احتساب يارانه ارزي",
            "قيمت کل مورد درتعهد با احتساب يارانه ارزي",
            "سهم سازمان",
        ]
        row = {
            "کد ژنريک": "00001",
            "کد برند": "00001",
            "عنوان": "A.C.A",
            " درصد سهم سازمان با احتساب يارانه ارزي": None,
            " مبلغ سهم سازمان با احتساب يارانه ارزي": "22,225",
            "قيمت کل مورد درتعهد با احتساب يارانه ارزي": "31,000",
            "سهم سازمان": "70%",
        }
        coverage, warning = coverage_payload(
            row,
            headers,
            "health_insurance",
            "https://mdp.ihio.gov.ir/",
            "2026-08-07T00:00:00+00:00",
        )
        self.assertIsNone(warning)
        self.assertIsNotNone(coverage)
        assert coverage is not None
        self.assertAlmostEqual(coverage["percent"], 71.693548, places=6)
        self.assertEqual(coverage["genericCode"], "00001")
        self.assertIn("محاسبه", coverage["sourceReference"])

    def test_health_explicit_share_percent_is_safe_last_fallback(self) -> None:
        headers = [
            "کد ژنريک",
            "عنوان",
            " درصد سهم سازمان با احتساب يارانه ارزي",
            " مبلغ سهم سازمان با احتساب يارانه ارزي",
            "قيمت کل مورد درتعهد با احتساب يارانه ارزي",
            "سهم سازمان",
        ]
        row = {
            "کد ژنريک": "02015",
            "عنوان": "ACARBOSE",
            " درصد سهم سازمان با احتساب يارانه ارزي": " ",
            " مبلغ سهم سازمان با احتساب يارانه ارزي": None,
            "قيمت کل مورد درتعهد با احتساب يارانه ارزي": None,
            "سهم سازمان": "70%",
        }
        coverage, warning = coverage_payload(
            row,
            headers,
            "health_insurance",
            "https://mdp.ihio.gov.ir/",
            "2026-08-07T00:00:00+00:00",
        )
        self.assertIsNone(warning)
        self.assertIsNotNone(coverage)
        assert coverage is not None
        self.assertEqual(coverage["percent"], 70)
        self.assertEqual(coverage["sourceReference"], "سهم سازمان")

    def test_plain_numeric_share_is_not_misread_as_percent(self) -> None:
        headers = [
            "کد ژنريک",
            "عنوان",
            " درصد سهم سازمان با احتساب يارانه ارزي",
            " مبلغ سهم سازمان با احتساب يارانه ارزي",
            "قيمت کل مورد درتعهد با احتساب يارانه ارزي",
            "سهم سازمان",
        ]
        row = {
            "کد ژنريک": "02015",
            "عنوان": "ACARBOSE",
            " درصد سهم سازمان با احتساب يارانه ارزي": None,
            " مبلغ سهم سازمان با احتساب يارانه ارزي": None,
            "قيمت کل مورد درتعهد با احتساب يارانه ارزي": None,
            "سهم سازمان": "70000",
        }
        coverage, warning = coverage_payload(
            row,
            headers,
            "health_insurance",
            "https://mdp.ihio.gov.ir/",
            "2026-08-07T00:00:00+00:00",
        )
        self.assertIsNone(coverage)
        self.assertIsNotNone(warning)


if __name__ == "__main__":
    unittest.main()
