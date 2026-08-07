from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import normalize_bundle as _base


_ORIGINAL_COVERAGE_PAYLOAD = _base.coverage_payload

HEALTH_INSURER_AMOUNT_HEADERS = [
    "مبلغ سهم سازمان با احتساب یارانه ارزی",
    "مبلغ سهم سازمان با احتساب يارانه ارزي",
]
HEALTH_ACCEPTED_TOTAL_HEADERS = [
    "قیمت کل مورد درتعهد با احتساب یارانه ارزی",
    "قيمت کل مورد درتعهد با احتساب يارانه ارزي",
]
HEALTH_FALLBACK_PERCENT_HEADERS = [
    "سهم سازمان",
]
HEALTH_NONBLOCKING_PREFIX = "[nonblocking-ihio-missing-percent]"
HEALTH_ROW_ERROR_PREFIX = "بیمه سلامت: ردیف "
NFI_AUTHORITATIVE_GENERIC_HEADERS = ["NFI_Generic_Name", "NFI Generic Name"]
NFI_SOURCE_HOST = "irc.fda.gov.ir"


def _coverage_record(
    row: dict[str, Any],
    headers: list[str],
    provider: str,
    source_url: str,
    observed_at: str,
    percent: float,
    source_reference: str,
) -> dict[str, Any]:
    return {
        "provider": provider,
        "percent": round(percent, 6),
        "origin": "source",
        "genericCode": str(_base.provider_value(row, headers, provider, "generic_code") or "").strip() or None,
        "brandCode": str(_base.provider_value(row, headers, provider, "brand_code") or "").strip() or None,
        "effectiveAt": observed_at,
        "sourceUrl": source_url,
        "sourceReference": source_reference,
    }


def _explicit_percent(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if "%" not in text and "٪" not in text:
        return None
    return _base.normalize_percent(value)


def coverage_payload(
    row: dict[str, Any],
    headers: list[str],
    provider: str,
    source_url: str,
    observed_at: str,
    default_currency: str | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Use strict source fields first, then safe IHIO-only fallbacks."""
    coverage, error = _ORIGINAL_COVERAGE_PAYLOAD(
        row,
        headers,
        provider,
        source_url,
        observed_at,
        default_currency,
    )
    if coverage is not None or provider != "health_insurance":
        return coverage, error

    insurer_header = _base.exact_header(headers, HEALTH_INSURER_AMOUNT_HEADERS)
    total_header = _base.exact_header(headers, HEALTH_ACCEPTED_TOTAL_HEADERS)
    insurer_amount = _base.number(row.get(insurer_header)) if insurer_header else None
    accepted_total = _base.number(row.get(total_header)) if total_header else None
    if insurer_amount is not None and accepted_total is not None and accepted_total > 0:
        percent = insurer_amount / accepted_total * 100
        if 0 <= percent <= 100:
            return _coverage_record(
                row,
                headers,
                provider,
                source_url,
                observed_at,
                percent,
                f"محاسبه از «{insurer_header}» ÷ «{total_header}»",
            ), None

    share_header = _base.exact_header(headers, HEALTH_FALLBACK_PERCENT_HEADERS)
    share_percent = _explicit_percent(row.get(share_header)) if share_header else None
    if share_percent is not None and 0 <= share_percent <= 100:
        return _coverage_record(
            row,
            headers,
            provider,
            source_url,
            observed_at,
            share_percent,
            share_header or "سهم سازمان",
        ), None

    return None, (
        f"{HEALTH_NONBLOCKING_PREFIX} درصد پوشش بیمه سلامت نه در ستون درصد موجود بود "
        "و نه از مبلغ سهم سازمان/قیمت کل مورد تعهد قابل محاسبه بود؛ این ردیف بدون "
        "اختراع درصد پوشش از ورود پوشش بیمه‌ای کنار گذاشته شد."
    )


_base.coverage_payload = coverage_payload


def _is_nonblocking_health_diagnostic(message: str) -> bool:
    return message.startswith(HEALTH_ROW_ERROR_PREFIX) and HEALTH_NONBLOCKING_PREFIX in message


def _clean_nonblocking_message(message: str) -> str:
    return message.replace(HEALTH_NONBLOCKING_PREFIX, "").strip()


def _scope_match_confidence(raw_name: str, scope_entry: dict[str, Any]) -> float:
    normalized = _base.normalize_text(raw_name)
    aliases = {_base.normalize_text(alias) for alias in scope_entry.get("aliases", [])}
    return 0.99 if normalized in aliases else 0.96


def _unique_put(
    target: dict[tuple[str, str], dict[str, Any] | None],
    key: tuple[str, str] | None,
    value: dict[str, Any],
) -> None:
    if not key or not key[1]:
        return
    current = target.get(key)
    if current is None and key in target:
        return
    if current and current.get("canonicalName") != value.get("canonicalName"):
        target[key] = None
    else:
        target[key] = value


def _normalized_generic_code(value: Any) -> str:
    """Normalize equivalent numeric generic codes such as 01523 and 1523."""
    text = str(value or "").strip().translate(_base.DIGIT_TRANSLATION)
    text = re.sub(r"\s+", "", text)
    if not text:
        return ""
    if re.fullmatch(r"\d+", text):
        return str(int(text))
    return _base.normalize_text(text)


def _nfi_authoritative_identity_index(
    nfi_path: Path,
    scope: list[dict[str, Any]],
) -> dict[tuple[str, str], dict[str, Any] | None]:
    rows, headers, _ = _base.nfi_workbook_rows(nfi_path)
    generic_header = _base.exact_header(headers, NFI_AUTHORITATIVE_GENERIC_HEADERS)
    if not generic_header:
        return {}

    index: dict[tuple[str, str], dict[str, Any] | None] = {}
    for row in rows:
        raw_name = str(row.get(generic_header) or "").strip()
        if not raw_name:
            continue
        scope_entry = _base.match_scope(raw_name, scope)
        if not scope_entry:
            continue
        info = {
            "canonicalName": scope_entry["canonicalName"],
            "rawName": raw_name,
            "confidence": _scope_match_confidence(raw_name, scope_entry),
            "clinicalDomains": scope_entry.get("clinicalDomains", []),
        }
        registry_code = _base.normalize_text(_base.nfi_registry_code(row, headers))
        detail_id = _base.normalize_text(_base.direct_value(row, _base.NFI_DETAIL_ID_HEADER))
        generic_code = _normalized_generic_code(_base.value(row, headers, "generic_code"))
        if registry_code:
            _unique_put(index, ("irc", registry_code), info)
        if detail_id:
            _unique_put(index, ("detail", detail_id), info)
        if generic_code:
            _unique_put(index, ("generic_code", generic_code), info)
    return index


def _record_detail_id(record: dict[str, Any]) -> str:
    match = re.search(r"(?:^|·)\s*Detail\s+([^·]+)", str(record.get("sourceReference") or ""), flags=re.IGNORECASE)
    return _base.normalize_text(match.group(1)) if match else ""


def _refine_nfi_records(
    bundle: dict[str, Any],
    nfi_path: Path,
    scope: list[dict[str, Any]],
) -> tuple[int, int]:
    index = _nfi_authoritative_identity_index(nfi_path, scope)
    if not index:
        return 0, 0

    corrected = 0
    confidence_upgrades = 0
    for record in bundle.get("records", []):
        if record.get("insuranceCoverages"):
            continue
        if NFI_SOURCE_HOST not in str(record.get("sourceUrl") or ""):
            continue

        registry_code = _base.normalize_text(record.get("brandRegistryCode"))
        detail_id = _record_detail_id(record)
        generic_code = _normalized_generic_code(record.get("genericRegistryCode"))
        info = index.get(("irc", registry_code)) if registry_code else None
        if info is None and detail_id:
            info = index.get(("detail", detail_id))
        if info is None and generic_code:
            info = index.get(("generic_code", generic_code))
        if not info:
            continue

        if record.get("genericName") != info["canonicalName"]:
            record["genericName"] = info["canonicalName"]
            record["clinicalDomains"] = info.get("clinicalDomains") or record.get("clinicalDomains")
            corrected += 1
        previous_confidence = float(record.get("matchConfidence") or 0)
        if previous_confidence < float(info["confidence"]):
            record["matchConfidence"] = info["confidence"]
            confidence_upgrades += 1
        reference = str(record.get("sourceReference") or "").strip()
        evidence = f"NFI generic {info['rawName']}"
        if evidence not in reference:
            record["sourceReference"] = " · ".join(filter(None, [reference, evidence]))
    return corrected, confidence_upgrades


def _insurance_scope_code_index(
    insurance_path: Path,
    scope: list[dict[str, Any]],
) -> dict[tuple[str, str], dict[str, Any] | None]:
    index: dict[tuple[str, str], dict[str, Any] | None] = {}
    for provider, meta in _base.SOURCE_META.items():
        try:
            rows, headers, _ = _base.workbook_rows(insurance_path, meta["sheet"])
        except Exception:
            continue
        for row in rows:
            raw_name = str(_base.provider_value(row, headers, provider, "generic_name") or "").strip()
            generic_code = _normalized_generic_code(_base.provider_value(row, headers, provider, "generic_code"))
            if not raw_name or not generic_code:
                continue
            scope_entry = _base.match_scope(raw_name, scope)
            if not scope_entry:
                continue
            info = {
                "canonicalName": scope_entry["canonicalName"],
                "confidence": _scope_match_confidence(raw_name, scope_entry),
                "clinicalDomains": scope_entry.get("clinicalDomains", []),
            }
            _unique_put(index, (provider, generic_code), info)
    return index


def _insurance_generic_code_consensus(
    insurance_path: Path,
    scope: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Return only cross-insurer generic-code identities with no name conflict.

    Numeric codes are canonicalized so 01523 and 1523 are treated as the same
    code. A code is considered authoritative for correcting an NFI seed-query
    mismatch only when at least two independent insurer sources resolve it to
    the same canonical drug. This avoids using one fuzzy name as truth.
    """
    observations: dict[str, dict[str, Any]] = {}
    for provider, meta in _base.SOURCE_META.items():
        try:
            rows, headers, _ = _base.workbook_rows(insurance_path, meta["sheet"])
        except Exception:
            continue
        seen_in_provider: set[tuple[str, str]] = set()
        for row in rows:
            raw_name = str(_base.provider_value(row, headers, provider, "generic_name") or "").strip()
            code = _normalized_generic_code(_base.provider_value(row, headers, provider, "generic_code"))
            if not raw_name or not code:
                continue
            scope_entry = _base.match_scope(raw_name, scope)
            if not scope_entry:
                continue
            canonical = scope_entry["canonicalName"]
            provider_key = (code, canonical)
            if provider_key in seen_in_provider:
                continue
            seen_in_provider.add(provider_key)
            bucket = observations.setdefault(code, {"names": {}, "providers": set()})
            bucket["providers"].add(provider)
            name_bucket = bucket["names"].setdefault(canonical, {
                "providers": set(),
                "confidence": 0.0,
                "clinicalDomains": scope_entry.get("clinicalDomains", []),
            })
            name_bucket["providers"].add(provider)
            name_bucket["confidence"] = max(
                float(name_bucket["confidence"]),
                _scope_match_confidence(raw_name, scope_entry),
            )

    consensus: dict[str, dict[str, Any]] = {}
    for code, bucket in observations.items():
        names = bucket["names"]
        if len(names) != 1:
            continue
        canonical, info = next(iter(names.items()))
        providers = set(info["providers"])
        if len(providers) < 2:
            continue
        consensus[code] = {
            "canonicalName": canonical,
            "confidence": max(0.98, float(info["confidence"])),
            "clinicalDomains": info.get("clinicalDomains", []),
            "providers": sorted(providers),
        }
    return consensus


def _refine_nfi_from_insurance_codes(
    bundle: dict[str, Any],
    insurance_path: Path,
    scope: list[dict[str, Any]],
) -> tuple[int, int]:
    """Correct NFI records when two+ insurers agree on the same generic code."""
    consensus = _insurance_generic_code_consensus(insurance_path, scope)
    corrected = 0
    upgraded = 0
    for record in bundle.get("records", []):
        if record.get("insuranceCoverages"):
            continue
        if NFI_SOURCE_HOST not in str(record.get("sourceUrl") or ""):
            continue
        code = _normalized_generic_code(record.get("genericRegistryCode"))
        info = consensus.get(code)
        if not info:
            continue
        if record.get("genericName") != info["canonicalName"]:
            record["genericName"] = info["canonicalName"]
            record["clinicalDomains"] = info.get("clinicalDomains") or record.get("clinicalDomains")
            corrected += 1
        confidence = float(info["confidence"])
        if float(record.get("matchConfidence") or 0) < confidence:
            record["matchConfidence"] = confidence
            upgraded += 1
        evidence = f"insurer generic-code consensus {code} ({', '.join(info['providers'])})"
        reference = str(record.get("sourceReference") or "").strip()
        if evidence not in reference:
            record["sourceReference"] = " · ".join(filter(None, [reference, evidence]))
    return corrected, upgraded


def _refine_insurance_records(
    bundle: dict[str, Any],
    insurance_path: Path,
    scope: list[dict[str, Any]],
) -> tuple[int, int]:
    """Use insurer generic code + source name to undo unsafe component/combination inheritance."""
    index = _insurance_scope_code_index(insurance_path, scope)
    corrected = 0
    upgraded = 0
    for record in bundle.get("records", []):
        coverages = record.get("insuranceCoverages") or []
        if len(coverages) != 1:
            continue
        coverage = coverages[0]
        provider = str(coverage.get("provider") or "")
        generic_code = _normalized_generic_code(coverage.get("genericCode"))
        if not provider or not generic_code:
            continue
        info = index.get((provider, generic_code))
        if not info:
            continue
        if record.get("genericName") != info["canonicalName"]:
            record["genericName"] = info["canonicalName"]
            record["clinicalDomains"] = info.get("clinicalDomains") or record.get("clinicalDomains")
            corrected += 1
        previous_confidence = float(record.get("matchConfidence") or 0)
        confidence = float(info["confidence"])
        if previous_confidence < confidence:
            record["matchConfidence"] = confidence
            upgraded += 1
    return corrected, upgraded


def _recompute_bundle_summary(bundle: dict[str, Any]) -> None:
    records = bundle.get("records", [])
    summary = bundle.get("run", {}).get("summary", {})
    summary["genericCount"] = len({_base.normalize_text(record.get("genericName")) for record in records if record.get("genericName")})
    summary["brandCount"] = len({
        (_base.normalize_text(record.get("genericName")), _base.normalize_text(record.get("brandName")))
        for record in records if record.get("brandName")
    })
    summary["ambiguousMatchCount"] = sum(1 for record in records if float(record.get("matchConfidence") or 0) < 0.9)
    sources = bundle.get("run", {}).get("sources", [])
    bundle["run"]["status"] = (
        "ready_to_publish"
        if all(source.get("status") == "succeeded" for source in sources) and summary["ambiguousMatchCount"] == 0
        else "needs_review"
    )


def build_bundle(
    nfi_path: Path,
    insurance_path: Path,
    default_currency: str | None = None,
    scope_path: Path = _base.DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    """Build a bundle, apply safe IHIO fallbacks, then refine source identity evidence."""
    bundle = _base.build_bundle(nfi_path, insurance_path, default_currency, scope_path)
    diagnostics = [str(item) for item in bundle.get("diagnostics", [])]
    nonblocking = [item for item in diagnostics if _is_nonblocking_health_diagnostic(item)]
    health_row_errors = [item for item in diagnostics if item.startswith(HEALTH_ROW_ERROR_PREFIX)]
    blocking_health = [item for item in health_row_errors if not _is_nonblocking_health_diagnostic(item)]

    if nonblocking and not blocking_health:
        for source in bundle.get("run", {}).get("sources", []):
            if source.get("sourceId") != "health_insurance":
                continue
            source["status"] = "succeeded"
            source["warningCount"] = len(nonblocking)
            source["skippedCoverageRowCount"] = len(nonblocking)
            source["warning"] = _clean_nonblocking_message(nonblocking[0])
            source["error"] = None
            break

        bundle["diagnostics"] = [
            f"هشدار غیرمسدودکننده · {_clean_nonblocking_message(item)}"
            if _is_nonblocking_health_diagnostic(item)
            else item
            for item in diagnostics
        ]

        summary = bundle.get("run", {}).get("summary", {})
        current_error_count = int(summary.get("errorCount", 0) or 0)
        summary["errorCount"] = max(0, current_error_count - len(nonblocking))
        summary["warningCount"] = int(summary.get("warningCount", 0) or 0) + len(nonblocking)

    try:
        scope = _base.load_scope(scope_path)
        nfi_corrected, nfi_upgraded = _refine_nfi_records(bundle, nfi_path, scope)
        code_corrected, code_upgraded = _refine_nfi_from_insurance_codes(bundle, insurance_path, scope)
        insurance_corrected, insurance_upgraded = _refine_insurance_records(bundle, insurance_path, scope)
        bundle.setdefault("diagnostics", []).append(
            f"Identity refinement: {nfi_corrected} NFI labels corrected from NFI identity; "
            f"{code_corrected} NFI labels corrected from cross-insurer generic-code consensus; "
            f"{insurance_corrected} insurance labels corrected; "
            f"confidence upgrades NFI={nfi_upgraded}, code-consensus={code_upgraded}, insurance={insurance_upgraded}."
        )
    except Exception as exc:
        bundle.setdefault("diagnostics", []).append(f"Identity refinement warning: {exc}")

    _recompute_bundle_summary(bundle)
    return bundle


def write_bundle(
    nfi_path: Path,
    insurance_path: Path,
    output_path: Path,
    default_currency: str | None = None,
    scope_path: Path = _base.DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    bundle = build_bundle(nfi_path, insurance_path, default_currency, scope_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    return bundle


number = _base.number
normalize_percent = _base.normalize_percent
