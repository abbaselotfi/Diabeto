from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import normalize_bundle as _raw
import normalize_bundle_runtime as _runtime
from source_consensus import apply_identity_consensus, normalize_generic_code, record_generic_code, record_source_id


_UNKNOWN_VALUES = {"", "?", "-", "--", "un", "unknown", "n/a", "na", "none", "null"}


def _usable(value: Any) -> str | None:
    text = str(value or "").strip()
    if _raw.normalize_text(text) in _UNKNOWN_VALUES:
        return None
    return text or None


def _infer_dosage_form(raw_name: str) -> str | None:
    text = str(raw_name or "").upper().replace("\u200c", " ")
    words = set(re.findall(r"[A-Z]+", text))
    extended = (
        "EXTENDED RELEASE" in text
        or "SUSTAINED RELEASE" in text
        or bool(words & {"XR", "ER", "MR", "XL"})
    )
    if "TABLET" in text or "TAB" in words:
        return "TABLET, EXTENDED RELEASE" if extended else "TABLET"
    if "CAPSULE" in text or "CAP" in words:
        return "CAPSULE, EXTENDED RELEASE" if extended else "CAPSULE"
    if "PEN" in words:
        return "PEN"
    if any(token in text for token in ("INJECTION", " INJ ", "VIAL", "AMPOULE", "AMPUL")):
        return "INJ"
    if "SUSPENSION" in text:
        return "SUSPENSION"
    if "SOLUTION" in text:
        return "SOLUTION"
    if "SYRUP" in text:
        return "SYRUP"
    return None


def _clean_strength(match: str) -> str:
    text = " ".join(str(match).strip().split())
    text = re.sub(r"\s*/\s*", "/", text)
    text = text.replace("[IU]", "IU").replace("[iU]", "IU").replace("[iu]", "IU")
    return text


def _infer_strength(raw_name: str) -> str | None:
    text = str(raw_name or "").translate(_raw.DIGIT_TRANSLATION)
    patterns = [
        r"\d+(?:\.\d+)?\s*\[?\s*(?:i\s*\.?\s*u\.?|iu|units?|unit)\s*\]?\s*/\s*\d+(?:\.\d+)?\s*m\s*l",
        r"\d+(?:\.\d+)?\s*(?:mg|mcg|µg|μg|ug)\s*/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|µg|μg|ug)(?:\s*/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|µg|μg|ug))?",
        r"\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?){1,2}\s*(?:mg|mcg|µg|μg|ug)",
        r"\d+(?:\.\d+)?\s*(?:mg|mcg|µg|μg|ug|g)\s*/\s*\d+(?:\.\d+)?\s*m\s*l",
        r"\d+(?:\.\d+)?\s*(?:mg|mcg|µg|μg|ug|g)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return _clean_strength(match.group(0))
    return None


def _source_hint_index(insurance_path: Path) -> dict[tuple[str, str], dict[str, str]]:
    collected: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(lambda: {
        "form": set(),
        "strength": set(),
        "raw": set(),
    })
    for provider, meta in _raw.SOURCE_META.items():
        try:
            rows, headers, _ = _raw.workbook_rows(insurance_path, meta["sheet"])
        except Exception:
            continue
        for row in rows:
            code = normalize_generic_code(_raw.provider_value(row, headers, provider, "generic_code"))
            raw_name = str(_raw.provider_value(row, headers, provider, "generic_name") or "").strip()
            if not code or not raw_name:
                continue
            form = _usable(_raw.provider_value(row, headers, provider, "dosage_form")) or _infer_dosage_form(raw_name)
            strength = _usable(_raw.provider_value(row, headers, provider, "strength")) or _infer_strength(raw_name)
            bucket = collected[(provider, code)]
            if form:
                bucket["form"].add(form)
            if strength:
                bucket["strength"].add(strength)
            bucket["raw"].add(raw_name)

    result: dict[tuple[str, str], dict[str, str]] = {}
    for key, bucket in collected.items():
        info: dict[str, str] = {}
        if len(bucket["form"]) == 1:
            info["form"] = next(iter(bucket["form"]))
        if len(bucket["strength"]) == 1:
            info["strength"] = next(iter(bucket["strength"]))
        if len(bucket["raw"]) == 1:
            info["raw"] = next(iter(bucket["raw"]))
        if info:
            result[key] = info
    return result


def _enrich_insurance_presentations(bundle: dict[str, Any], insurance_path: Path) -> int:
    hints = _source_hint_index(insurance_path)
    enriched = 0
    audit = bundle.setdefault("standardizationAudit", [])
    for record in bundle.get("records", []):
        source = record_source_id(record)
        if source not in _raw.SOURCE_META:
            continue
        code = record_generic_code(record)
        if not code:
            continue
        hint = hints.get((source, code))
        if not hint:
            continue
        changes: dict[str, Any] = {}
        if not _usable(record.get("dosageForm")) and hint.get("form"):
            changes["dosageForm"] = hint["form"]
        if not _usable(record.get("strengthPresentation")) and hint.get("strength"):
            changes["strengthPresentation"] = hint["strength"]
        if not changes:
            continue
        record.update(changes)
        evidence = f"source presentation recovery {source} code {code}"
        reference = str(record.get("sourceReference") or "").strip()
        if evidence not in reference:
            record["sourceReference"] = " · ".join(filter(None, [reference, evidence]))
        audit.append({
            "kind": "source_presentation_recovery",
            "sourceId": source,
            "genericCode": code,
            "changes": changes,
            "rawSourceLabel": hint.get("raw"),
        })
        enriched += 1
    return enriched


def _recompute(bundle: dict[str, Any]) -> None:
    records = bundle.get("records", [])
    summary = bundle.setdefault("run", {}).setdefault("summary", {})
    summary["genericCount"] = len({
        _raw.normalize_text(record.get("genericName"))
        for record in records
        if record.get("genericName")
    })
    summary["brandCount"] = len({
        (_raw.normalize_text(record.get("genericName")), _raw.normalize_text(record.get("brandName")))
        for record in records
        if record.get("brandName")
    })
    summary["ambiguousMatchCount"] = sum(
        1 for record in records if float(record.get("matchConfidence") or 0) < 0.9
    )
    sources = bundle.get("run", {}).get("sources", [])
    error_count = int(summary.get("errorCount", 0) or 0)
    bundle["run"]["status"] = (
        "ready_to_publish"
        if sources
        and all(source.get("status") == "succeeded" for source in sources)
        and summary["ambiguousMatchCount"] == 0
        and error_count == 0
        else "needs_review"
    )


def build_bundle(
    nfi_path: Path,
    insurance_path: Path,
    default_currency: str | None = None,
    scope_path: Path = _raw.DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    """Runtime bundle plus source-independent consensus standardization.

    Source values are never deleted. The standardized value is written to the
    canonical record while the reason/supporting sources remain in the audit and
    sourceReference fields.
    """
    bundle = _runtime.build_bundle(nfi_path, insurance_path, default_currency, scope_path)
    enriched = _enrich_insurance_presentations(bundle, insurance_path)
    consensus = apply_identity_consensus(bundle)
    bundle.setdefault("diagnostics", []).append(
        "Four-source standardization: "
        f"presentation fields recovered={enriched}; "
        f"identity groups={consensus['identityConsensusGroups']}; "
        f"identity corrections={consensus['identityCorrections']}; "
        f"confidence upgrades={consensus['identityConfidenceUpgrades']}."
    )
    _recompute(bundle)
    return bundle


def write_bundle(
    nfi_path: Path,
    insurance_path: Path,
    output_path: Path,
    default_currency: str | None = None,
    scope_path: Path = _raw.DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    bundle = build_bundle(nfi_path, insurance_path, default_currency, scope_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    return bundle
