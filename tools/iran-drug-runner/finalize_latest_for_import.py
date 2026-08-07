from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
RUNS_DIR = ROOT / "runs"
SOURCE_NAME = "glymize-drug-bundle-fixed.json"
OUTPUT_NAME = "glymize-drug-bundle-ready.json"
REFERENCE_CATALOG_PATH = REPO_ROOT / "apps" / "api" / "src" / "catalog" / "global-reference-catalog.ts"

DIGIT_TRANSLATION = str.maketrans({
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
})


def _normalized(value: Any) -> str:
    text = str(value or "").strip().lower().translate(DIGIT_TRANSLATION).replace("\u200c", " ")
    text = re.sub(r"[^a-z0-9آ-ی.]+", " ", text)
    return " ".join(text.split())


def _reference_generic_label(value: Any) -> str:
    """Return the English/canonical side without breaking internal slashes.

    Reference catalogue labels use ``English / فارسی``. Some English names also
    contain a slash (for example human insulin isophane/regular), so splitting
    on every slash would corrupt the drug identity.
    """
    text = str(value or "").strip()
    return text.split(" / ", 1)[0].strip() if " / " in text else text


def _load_reference_catalogue() -> list[dict[str, Any]]:
    text = REFERENCE_CATALOG_PATH.read_text(encoding="utf-8")
    start_marker = "export const globalReferenceCatalogue: readonly ReferenceMedicationPresentation[] = "
    end_marker = ";\n\nexport const globalReferenceCatalogueSources"
    if start_marker not in text or end_marker not in text:
        raise ValueError("ساختار فایل global-reference-catalog.ts شناخته نشد.")
    payload = text.split(start_marker, 1)[1].split(end_marker, 1)[0]
    parsed = json.loads(payload)
    if not isinstance(parsed, list):
        raise ValueError("فهرست مرجع دارویی معتبر نیست.")
    return parsed


def _form_family(value: Any) -> str:
    text = _normalized(value)
    words = set(text.split())
    if any(token in text for token in ("injection", "injectable", "vial", "pen", "cartridge", "ampoule", "تزریق", "ویال", "قلم", "کارتریج")):
        return "injectable"
    if "tablet" in words or "tab" in words or "قرص" in words:
        return "tablet"
    if "capsule" in words or "cap" in words or "کپسول" in words:
        return "capsule"
    if any(token in text for token in ("solution", "syrup", "suspension", "محلول", "شربت", "سوسپانسیون")):
        return "liquid"
    if any(token in text for token in ("inhal", "استنشاق")):
        return "inhaled"
    return ""


def _release_kind(value: Any) -> str:
    text = _normalized(value)
    words = set(text.split())
    if (
        "extended release" in text
        or "sustained release" in text
        or "رهش پایدار" in text
        or "رهش طولانی" in text
        or any(token in words for token in ("er", "xr", "mr", "xl"))
    ):
        return "extended"
    if "immediate release" in text or "فوری" in words or "ir" in words:
        return "immediate"
    if _form_family(value) == "tablet":
        # NFI normally marks modified-release tablets explicitly. A plain TABLET
        # therefore safely distinguishes the immediate-release reference row.
        return "immediate"
    return ""


def _number_set(value: Any) -> set[float]:
    text = str(value or "").translate(DIGIT_TRANSLATION)
    return {round(float(match), 6) for match in re.findall(r"\d+(?:\.\d+)?", text)}


def _u_concentrations(value: Any) -> set[float]:
    text = str(value or "").lower().translate(DIGIT_TRANSLATION)
    text = text.replace("µ", "u").replace("μ", "u")
    result: set[float] = set()
    for match in re.findall(r"\bu\s*[- ]\s*(\d+(?:\.\d+)?)", text, flags=re.IGNORECASE):
        result.add(round(float(match), 6))
    for match in re.findall(
        r"(\d+(?:\.\d+)?)\s*(?:i\.?u\.?|units?|unit|واحد)\s*(?:/|per\s*)?\s*(?:m\s*l|ml|میلی\s*لیتر)?",
        text,
        flags=re.IGNORECASE,
    ):
        result.add(round(float(match), 6))
    return result


def _ratio_pairs(value: Any) -> set[tuple[float, float]]:
    text = str(value or "").translate(DIGIT_TRANSLATION)
    pairs: set[tuple[float, float]] = set()
    for left, right in re.findall(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", text):
        pair = tuple(sorted((round(float(left), 6), round(float(right), 6))))
        pairs.add(pair)
    return pairs


def _presentation_score(record: dict[str, Any], candidate: dict[str, Any]) -> tuple[int, int]:
    """Score only presentation evidence, never clinical indication.

    The score is intentionally conservative. It is used only after the generic
    identity is already an exact canonical match. A presentation is selected
    automatically only when one candidate wins by a clear margin.
    """
    score = 0
    evidence = 0

    record_form = record.get("dosageForm")
    candidate_form = candidate.get("dosageForm")
    record_family = _form_family(record_form)
    candidate_family = _form_family(candidate_form)
    if record_family and candidate_family:
        evidence += 1
        score += 4 if record_family == candidate_family else -5

    record_release = _release_kind(record_form)
    candidate_release = _release_kind(candidate_form)
    if record_release and candidate_release and record_family == "tablet" and candidate_family == "tablet":
        evidence += 1
        score += 6 if record_release == candidate_release else -7

    record_strength = record.get("strengthPresentation")
    candidate_strength = candidate.get("strengthPresentation")

    record_u = _u_concentrations(record_strength)
    candidate_u = _u_concentrations(candidate_strength)
    if record_u:
        evidence += 1
        if candidate_u:
            score += 10 if record_u & candidate_u else -10

    record_ratios = _ratio_pairs(record_strength)
    candidate_ratios = _ratio_pairs(candidate_strength)
    if record_ratios:
        evidence += 1
        if candidate_ratios:
            score += 8 if record_ratios & candidate_ratios else -8

    record_numbers = _number_set(record_strength)
    candidate_numbers = _number_set(candidate_strength)
    if record_numbers:
        evidence += 1
        if record_numbers <= candidate_numbers:
            score += 5
        elif record_numbers & candidate_numbers:
            score += 1
        elif candidate_numbers:
            score -= 4

    normalized_record_strength = _normalized(record_strength)
    normalized_candidate_strength = _normalized(candidate_strength)
    if normalized_record_strength and normalized_candidate_strength and (
        normalized_record_strength == normalized_candidate_strength
        or normalized_record_strength in normalized_candidate_strength
    ):
        score += 3

    return score, evidence


def _reference_candidates(record: dict[str, Any], catalogue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    wanted = _normalized(record.get("genericName"))
    return [
        item for item in catalogue
        if _normalized(_reference_generic_label(item.get("genericName"))) == wanted
    ]


def _resolve_reference_presentation(
    record: dict[str, Any],
    catalogue: list[dict[str, Any]],
) -> str | None:
    if record.get("referencePresentationId"):
        wanted_id = str(record["referencePresentationId"])
        return wanted_id if any(str(item.get("id")) == wanted_id for item in catalogue) else None

    candidates = _reference_candidates(record, catalogue)
    if len(candidates) == 1:
        return str(candidates[0]["id"])
    if not candidates:
        return None

    # Dosage-form family is stronger than raw numeric strength when the source
    # and reference describe the same product at different presentation levels.
    # Example: NFI Semaglutide pens are recorded as total pen content such as
    # 4 mg/3 mL or 8 mg/3 mL, while the reference row lists delivered doses
    # (0.25/0.5/1/2 mg). If only one exact-generic candidate is injectable and
    # the other is oral, the route/form family safely resolves the presentation.
    record_family = _form_family(record.get("dosageForm"))
    if record_family:
        family_matches = [
            candidate for candidate in candidates
            if _form_family(candidate.get("dosageForm")) == record_family
        ]
        if len(family_matches) == 1:
            return str(family_matches[0]["id"])
        if family_matches:
            candidates = family_matches

    ranked = sorted(
        [(*_presentation_score(record, candidate), candidate) for candidate in candidates],
        key=lambda item: (item[0], item[1]),
        reverse=True,
    )
    best_score, best_evidence, best = ranked[0]
    second_score = ranked[1][0] if len(ranked) > 1 else -999
    if best_evidence > 0 and best_score >= 4 and best_score - second_score >= 3:
        return str(best["id"])
    return None


def _attach_reference_presentations(
    records: list[dict[str, Any]],
    catalogue: list[dict[str, Any]],
) -> tuple[int, list[dict[str, Any]]]:
    resolved = 0
    unresolved: list[dict[str, Any]] = []
    for record in records:
        reference_id = _resolve_reference_presentation(record, catalogue)
        if not reference_id:
            unresolved.append(record)
            continue
        record["referencePresentationId"] = reference_id
        resolved += 1
    return resolved, unresolved


def _is_transitional_bromocriptine_candidate(record: dict[str, Any]) -> bool:
    """Recognize only the known 2.5 mg NFI record mislabeled by the diabetes seed scope."""
    return (
        _normalized(record.get("genericName")) == "bromocriptine qr"
        and _normalized(record.get("strengthPresentation")) in {"2.5 mg", "2 5 mg"}
        and "irc.fda.gov.ir" in str(record.get("sourceUrl") or "").lower()
        and bool(str(record.get("brandRegistryCode") or "").strip())
    )


def _master_candidate(record: dict[str, Any]) -> dict[str, Any]:
    candidate = copy.deepcopy(record)
    candidate.pop("referencePresentationId", None)
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
        1 for record in records
        if float(record.get("matchConfidence") or 0) < 0.9 or not record.get("referencePresentationId")
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


def finalize_bundle(
    bundle: dict[str, Any],
    reference_catalogue: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
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

    catalogue = reference_catalogue if reference_catalogue is not None else _load_reference_catalogue()
    resolved, unresolved = _attach_reference_presentations(result.get("records", []), catalogue)
    result.setdefault("diagnostics", []).append(
        f"Reference presentation resolution: {resolved} رکورد به شناسه ارائه مرجع یکتا متصل شد."
    )
    if unresolved:
        counts: dict[str, int] = {}
        for record in unresolved:
            name = str(record.get("genericName") or "?")
            counts[name] = counts.get(name, 0) + 1
        grouped = ", ".join(
            f"{name}={count}"
            for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:12]
        )
        sample = ", ".join(
            f"{record.get('genericName', '?')} / {record.get('dosageForm', '?')} / {record.get('strengthPresentation', '?')}"
            for record in unresolved[:8]
        )
        raise ValueError(
            f"{len(unresolved)} رکورد هنوز به ارائه مرجع یکتا متصل نشد. "
            f"گروه‌ها: {grouped}. نمونه‌ها: {sample}. "
            "انتشار تا رفع تطبیق presentation متوقف شد."
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
    records = finalized.get("records", [])
    references = sum(1 for record in records if record.get("referencePresentationId"))
    print(f"SOURCE: {source}")
    print(f"OUTPUT: {output}")
    print(f"RUN STATUS: {finalized['run']['status']}")
    print(f"IMPORT RECORDS: {len(records)}")
    print(f"REFERENCE IDS: {references}/{len(records)}")
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
