from __future__ import annotations

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
        "درصد پوشش بیمه سلامت نه در ستون درصد موجود بود و نه از مبلغ سهم سازمان/"
        "قیمت کل مورد تعهد قابل محاسبه بود."
    )


# build_bundle resolves coverage_payload from normalize_bundle's module globals at
# runtime. Replacing it here keeps one canonical implementation for all other
# normalization rules while applying the IHIO compatibility layer everywhere the
# local runner calls build_bundle/write_bundle.
_base.coverage_payload = coverage_payload

build_bundle = _base.build_bundle
write_bundle = _base.write_bundle
number = _base.number
normalize_percent = _base.normalize_percent
