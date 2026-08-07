from __future__ import annotations

import json
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
HEALTH_DIAGNOSTIC_PREFIX = "بیمه سلامت: "


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
    """Use the strict normalizer first, then apply source-specific safe fallbacks.

    IHIO occasionally leaves its dedicated coverage-percent cell blank while
    publishing the insurer amount and accepted total for the same row. In that
    case the percentage is exactly derivable from the two official amounts.
    A final fallback accepts the separate ``سهم سازمان`` field only when the
    cell explicitly contains a percent sign, avoiding accidental treatment of
    monetary amounts as percentages.

    If none of the official fields can produce a percentage, the row is not
    assigned an invented 0/70/100 percent value. It is skipped as an explicit
    non-blocking warning so a single incomplete IHIO row does not make the whole
    successfully downloaded source look unavailable.
    """
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


# build_bundle resolves coverage_payload from normalize_bundle's module globals at
# runtime. Replacing it here keeps one canonical implementation for all other
# normalization rules while applying the IHIO compatibility layer everywhere the
# local runner calls build_bundle/write_bundle.
_base.coverage_payload = coverage_payload


def _is_nonblocking_health_diagnostic(message: str) -> bool:
    return message.startswith(HEALTH_DIAGNOSTIC_PREFIX) and HEALTH_NONBLOCKING_PREFIX in message


def _clean_nonblocking_message(message: str) -> str:
    return message.replace(HEALTH_NONBLOCKING_PREFIX, "").strip()


def build_bundle(
    nfi_path: Path,
    insurance_path: Path,
    default_currency: str | None = None,
    scope_path: Path = _base.DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    """Build a bundle and downgrade only known IHIO missing-percent rows to warnings.

    The base normalizer correctly skips a row whenever coverage cannot be
    calculated. Historically that row-level condition also marked the entire
    IHIO source as ``needs_review``. Here we preserve the skipped row and its
    audit trail, but do not block the complete source when *all* IHIO row errors
    are exactly this known missing-percent condition.
    """
    bundle = _base.build_bundle(nfi_path, insurance_path, default_currency, scope_path)
    diagnostics = [str(item) for item in bundle.get("diagnostics", [])]
    nonblocking = [item for item in diagnostics if _is_nonblocking_health_diagnostic(item)]
    health_diagnostics = [item for item in diagnostics if item.startswith(HEALTH_DIAGNOSTIC_PREFIX)]
    blocking_health = [item for item in health_diagnostics if not _is_nonblocking_health_diagnostic(item)]

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

        sources = bundle.get("run", {}).get("sources", [])
        ambiguous = int(summary.get("ambiguousMatchCount", 0) or 0)
        bundle["run"]["status"] = (
            "ready_to_publish"
            if all(source.get("status") == "succeeded" for source in sources) and ambiguous == 0
            else "needs_review"
        )

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
