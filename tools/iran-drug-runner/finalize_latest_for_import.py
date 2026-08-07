from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
RUNS_DIR = ROOT / "runs"
SOURCE_NAME = "glymize-drug-bundle-fixed.json"
OUTPUT_NAME = "glymize-drug-bundle-ready.json"


def _normalized(value: Any) -> str:
    text = str(value or "").strip().lower().replace("\u200c", " ")
    text = re.sub(r"[^a-z0-9آ-ی.]+", " ", text)
    return " ".join(text.split())


def _is_transitional_bromocriptine_candidate(record: dict[str, Any]) -> bool:
    """Recognize only the known 2.5 mg NFI record that was mislabeled by the diabetes seed scope.

    This is intentionally strict. We do not globally waive low-confidence records.
    The product is preserved for the future master registry under the substance-level
    identity ``Bromocriptine`` instead of forcing the formulation label ``Bromocriptine-QR``.
    """
    return (
        _normalized(record.get("genericName")) == "bromocriptine qr"
        and _normalized(record.get("strengthPresentation")) in {"2.5 mg", "2 5 mg"}
        and "irc.fda.gov.ir" in str(record.get("sourceUrl") or "").lower()
        and bool(str(record.get("brandRegistryCode") or "").strip())
    )


def _master_candidate(record: dict[str, Any]) -> dict[str, Any]:
    candidate = copy.deepcopy(record)
    candidate["originalGenericName"] = record.get("genericName")
    candidate["genericName"] = "Bromocriptine"
    candidate["clinicalDomains"] = []
    candidate["classificationStatus"] = "needs_domain_classification"
    candidate["identityDisposition"] = "preserved_for_master_registry"
    candidate["reviewReason"] = (
        "NFI محصول 2.5 mg را نشان می‌دهد، اما Scope قدیمی آن را Bromocriptine-QR نام‌گذاری کرده بود. "
        "رکورد حذف نشده و برای Master Drug Registry با هویت ماده‌ای Bromocriptine نگهداری شد."
    )
    return candidate


def _recompute_summary(bundle: dict[str, Any]) -> None:
    records = bundle.get("records", [])
    summary = bundle.setdefault("run", {}).setdefault("summary", {})
    summary["genericCount"] = len({
        _normalized(record.get("genericName"))
        for record in records
        if record.get("genericName")
    })
    summary["brandCount"] = len({
        (_normalized(record.get("genericName")), _normalized(record.get("brandName")))
        for record in records
        if record.get("brandName")
    })
    summary["ambiguousMatchCount"] = sum(
        1 for record in records if float(record.get("matchConfidence") or 0) < 0.9
    )
    sources = bundle.get("run", {}).get("sources", [])
    errors = int(summary.get("errorCount", 0) or 0)
    bundle["run"]["status"] = (
        "ready_to_publish"
        if sources
        and all(source.get("status") == "succeeded" for source in sources)
        and summary["ambiguousMatchCount"] == 0
        and errors == 0
        else "needs_review"
    )


def finalize_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(bundle)
    records = list(result.get("records", []))
    low_confidence = [record for record in records if float(record.get("matchConfidence") or 0) < 0.9]

    unsupported = [record for record in low_confidence if not _is_transitional_bromocriptine_candidate(record)]
    if unsupported:
        names = ", ".join(str(record.get("genericName") or "?") for record in unsupported[:5])
        raise ValueError(
            f"{len(unsupported)} رکورد کم‌اعتماد غیرشناخته‌شده باقی مانده است ({names}). "
            "برای جلوگیری از انتشار اشتباه، Finalize متوقف شد."
        )

    preserved = [_master_candidate(record) for record in low_confidence]
    if preserved:
        low_ids = {id(record) for record in low_confidence}
        result["records"] = [record for record in records if id(record) not in low_ids]
        result.setdefault("masterCandidates", []).extend(preserved)
        result.setdefault("diagnostics", []).append(
            f"Master registry bridge: {len(preserved)} رکورد کم‌اعتماد از Import بالینی جاری کنار گذاشته نشد؛ "
            "به masterCandidates منتقل شد تا بدون تحمیل برچسب بالینی/فرمولاسیون اشتباه نگهداری شود."
        )

    _recompute_summary(result)
    return result


def latest_bundle_path() -> Path:
    candidates = [path for path in RUNS_DIR.glob(f"*/output/{SOURCE_NAME}") if path.is_file()]
    if not candidates:
        raise FileNotFoundError(f"هیچ فایل {SOURCE_NAME} در runs پیدا نشد.")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def main() -> None:
    source = latest_bundle_path()
    bundle = json.loads(source.read_text(encoding="utf-8"))
    finalized = finalize_bundle(bundle)
    output = source.with_name(OUTPUT_NAME)
    output.write_text(json.dumps(finalized, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = finalized["run"]["summary"]
    print(f"SOURCE: {source}")
    print(f"OUTPUT: {output}")
    print(f"RUN STATUS: {finalized['run']['status']}")
    print(f"IMPORT RECORDS: {len(finalized.get('records', []))}")
    print(f"MASTER CANDIDATES: {len(finalized.get('masterCandidates', []))}")
    print(f"AMBIGUOUS: {summary.get('ambiguousMatchCount')}")
    print(f"ERRORS: {summary.get('errorCount')}")
    for candidate in finalized.get("masterCandidates", []):
        print(
            "MASTER CANDIDATE:",
            candidate.get("genericName"),
            "| original:",
            candidate.get("originalGenericName"),
            "| strength:",
            candidate.get("strengthPresentation"),
            "| IRC:",
            candidate.get("brandRegistryCode"),
        )


if __name__ == "__main__":
    main()
