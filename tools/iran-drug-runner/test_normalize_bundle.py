from __future__ import annotations

import tempfile
import unittest
import sys
from pathlib import Path

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parent))

from normalize_bundle import build_bundle, coverage_payload, price_payload


class NormalizeBundleTests(unittest.TestCase):
    @staticmethod
    def write_insurance_workbook(path: Path) -> None:
        insurance = Workbook()
        for index, sheet_name in enumerate(["بیمه سلامت", "ساتا", "تامین اجتماعی"]):
            target = insurance.active if index == 0 else insurance.create_sheet()
            target.title = sheet_name
            target.append(["نام ژنریک", "کد ژنریک", "کد برند", "درصد پوشش", "سهم سازمان", "سهم بیمار"])
            target.append(["Metformin", f"G-{index}", f"B-{index}", 70, 70_000, 30_000])
        insurance.save(path)

    def test_rial_price_is_converted_to_toman(self) -> None:
        headers = ["قیمت مصرف کننده ریال"]
        price, warning = price_payload(
            {headers[0]: 1_230_000},
            headers,
            "https://example.test",
            "2026-08-04T00:00:00+00:00",
            None,
        )
        self.assertIsNone(warning)
        self.assertEqual(price["amountToman"], 123_000)
        self.assertEqual(price["sourceCurrency"], "IRR")

    def test_complete_four_source_bundle_is_publishable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nfi_path = root / "nfi.xlsx"
            insurance_path = root / "insurance.xlsx"

            nfi = Workbook()
            sheet = nfi.active
            sheet.title = "NFI"
            sheet.append(["نام ژنریک", "کد ژنریک", "نام برند", "کد برند"])
            sheet.append(["Metformin", "NFI-G-1", "Sample brand", "NFI-B-1"])
            nfi.save(nfi_path)

            self.write_insurance_workbook(insurance_path)

            bundle = build_bundle(nfi_path, insurance_path, "TOMAN")
            self.assertEqual(bundle["run"]["status"], "ready_to_publish")
            self.assertTrue(all(source["status"] == "succeeded" for source in bundle["run"]["sources"]))
            self.assertEqual(len(bundle["records"]), 4)
            insurer_records = [record for record in bundle["records"] if record["insuranceCoverages"]]
            self.assertEqual({record["insuranceCoverages"][0]["genericCode"] for record in insurer_records}, {"G-0", "G-1", "G-2"})

    def test_rich_nfi_products_sheet_is_detected_and_preserves_review_confidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nfi_path = root / "nfi.xlsx"
            insurance_path = root / "insurance.xlsx"

            nfi = Workbook()
            summary = nfi.active
            summary.title = "NFI_Match_Summary"
            summary.append(["Drug_ID", "Generic_INN"])
            summary.append(["WD-1", "Metformin"])
            products = nfi.create_sheet("NFI_Products_1")
            products.append([
                "Generic_INN",
                "Match_Confidence_0_100",
                "NFI_Detail_ID",
                "NFI_Product_URL",
                "NFI_Title_FA",
                "NFI_Generic_Code",
                "NFI_IRC_Code",
                "Dosage_Form",
                "Strength",
                "Price_Per_Pack_IRR",
                "All_Label_Value_JSON",
                "Raw_Detail_Text",
            ])
            products.append([
                "Metformin", 96, "101", "https://irc.fda.gov.ir/NFI/Detail/101",
                "متفورمین تست قرص خوراکی 500 mg", "NFI-G-1", None, "TABLET", "500 mg",
                1_200_000, '{"نام":"METFORMIN TEST"}', ":IRC 6260000000001 :GTIN 06260000000001",
            ])
            # Same detail ID must not create a duplicate product.
            products.append([
                "Metformin", 91, "101", "https://irc.fda.gov.ir/NFI/Detail/101",
                "متفورمین تست قرص خوراکی 500 mg", "NFI-G-1", None, "TABLET", "500 mg",
                1_200_000, '{"نام":"METFORMIN TEST"}', ":IRC 6260000000001 :GTIN 06260000000001",
            ])
            products.append([
                "Metformin", 85, "102", "https://irc.fda.gov.ir/NFI/Detail/102",
                "متفورمین نیازمند بازبینی قرص خوراکی 1000 mg", "NFI-G-1", "6260000000002",
                "TABLET", "1000 mg", 2_000_000, None, "",
            ])
            nfi.save(nfi_path)
            self.write_insurance_workbook(insurance_path)

            bundle = build_bundle(nfi_path, insurance_path, "TOMAN")
            nfi_records = [record for record in bundle["records"] if not record["insuranceCoverages"]]
            self.assertEqual(len(nfi_records), 2)
            verified = next(record for record in nfi_records if record["matchConfidence"] == 0.96)
            review = next(record for record in nfi_records if record["matchConfidence"] == 0.85)
            self.assertEqual(verified["brandName"], "METFORMIN TEST")
            self.assertEqual(verified["brandRegistryCode"], "6260000000001")
            self.assertEqual(verified["genericRegistryCode"], "NFI-G-1")
            self.assertEqual(verified["price"]["amountToman"], 120_000)
            self.assertIn("GTIN 06260000000001", verified["sourceReference"])
            self.assertEqual(review["brandName"], "متفورمین نیازمند بازبینی")
            self.assertEqual(bundle["run"]["status"], "needs_review")
            self.assertEqual(bundle["run"]["summary"]["ambiguousMatchCount"], 1)
            self.assertTrue(any("1 ردیف تکراری حذف" in item for item in bundle["diagnostics"]))

    def test_insurance_shares_are_converted_from_rial_to_toman(self) -> None:
        headers = ["درصد پوشش", "سهم سازمان ریال", "سهم بیمار ریال", "قیمت مرجع ریال"]
        coverage, warning = coverage_payload(
            {headers[0]: 70, headers[1]: 700_000, headers[2]: 300_000, headers[3]: 1_000_000},
            headers,
            "health_insurance",
            "https://example.test",
            "2026-08-04T00:00:00+00:00",
            None,
        )
        self.assertIsNone(warning)
        self.assertEqual(coverage["insurerShareToman"], 70_000)
        self.assertEqual(coverage["patientShareToman"], 30_000)
        self.assertEqual(coverage["referencePriceToman"], 100_000)
        self.assertEqual(coverage["sourceCurrency"], "IRR")


if __name__ == "__main__":
    unittest.main()
