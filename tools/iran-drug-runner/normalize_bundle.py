from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


SOURCE_META = {
    "health_insurance": {
        "sheet": "بیمه سلامت",
        "url": "https://mdp.ihio.gov.ir/",
    },
    "armed_forces": {
        "sheet": "ساتا",
        "url": "https://esata.ir/web/sakhad/drug/",
    },
    "social_security": {
        "sheet": "تامین اجتماعی",
        "url": "https://darman.tamin.ir/Forms/Public/Druglist.aspx?pagename=hdpDrugList",
    },
}

DEFAULT_SCOPE_PATH = Path(__file__).resolve().with_name("scope_allowlist.json")

HEADER_ALIASES = {
    "generic_name": ["نام ژنریک", "نام علمی", "generic name", "genericname", "نام دارو"],
    "brand_name": ["نام برند", "نام تجاری", "brand name", "brandname"],
    "generic_code": ["کد ژنریک", "generic code", "genericcode", "کد دارو"],
    "brand_code": ["کد برند", "کد تجاری", "brand code", "brandcode", "کد فرآورده", "irc"],
    "dosage_form": ["شکل دارویی", "dosage form", "dosageform", "فرم دارویی"],
    "strength": ["قدرت", "دوز", "strength", "strength presentation"],
    "price": ["قیمت مصرف کننده", "قیمت مصرف‌کننده", "قیمت", "consumer price", "price"],
    "coverage_percent": ["درصد پوشش", "درصد بیمه", "coverage percent", "coverage"],
    "insurer_share": ["سهم سازمان", "سهم بیمه", "insurer share"],
    "patient_share": ["سهم بیمار", "فرانشیز", "patient share", "copay"],
    "reference_price": ["تعرفه", "قیمت مرجع", "reference price", "tariff"],
    "source_link": ["لینک", "آدرس منبع", "source url", "url"],
}


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.translate(str.maketrans("يىك۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "ییک01234567890123456789"))
    text = text.replace("\u200c", " ")
    return re.sub(r"[^a-z0-9آ-ی]+", " ", text).strip()


def load_scope(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if payload.get("schemaVersion") != 1 or not isinstance(entries, list) or not entries:
        raise ValueError("فهرست مجاز دامنه دارویی معتبر یا غیرخالی نیست.")
    validated: list[dict[str, Any]] = []
    for entry in entries:
        canonical = str(entry.get("canonicalName") or "").strip()
        aliases = [str(alias).strip() for alias in entry.get("aliases", []) if str(alias).strip()]
        domains = [str(domain).strip() for domain in entry.get("clinicalDomains", []) if str(domain).strip()]
        if not canonical or not aliases or not domains:
            raise ValueError(f"ردیف ناقص در فهرست مجاز: {entry}")
        validated.append({"canonicalName": canonical, "aliases": aliases, "clinicalDomains": domains})
    return validated


def match_scope(name: str, scope: list[dict[str, Any]]) -> dict[str, Any] | None:
    normalized_name = normalize_text(name)
    if not normalized_name:
        return None
    exact: list[dict[str, Any]] = []
    contained: list[dict[str, Any]] = []
    for entry in scope:
        aliases = {normalize_text(alias) for alias in entry["aliases"]}
        if normalized_name in aliases:
            exact.append(entry)
            continue
        if any(len(alias) >= 5 and alias in normalized_name for alias in aliases):
            contained.append(entry)
    candidates = exact or contained
    unique = {entry["canonicalName"]: entry for entry in candidates}
    return next(iter(unique.values())) if len(unique) == 1 else None


def number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    text = normalize_text(value).replace(" ", "").replace(",", "")
    text = text.replace("٪", "").replace("%", "")
    try:
        return float(text)
    except ValueError:
        return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def workbook_rows(path: Path, sheet_name: str | None = None) -> tuple[list[dict[str, Any]], list[str], str]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook[sheet_name] if sheet_name and sheet_name in workbook.sheetnames else workbook[workbook.sheetnames[0]]
    iterator = sheet.iter_rows(values_only=True)
    headers = [str(value or "").strip() for value in next(iterator, ())]
    rows = [dict(zip(headers, values)) for values in iterator if any(value not in (None, "") for value in values)]
    return rows, headers, sheet.title


def header_for(headers: list[str], field: str) -> str | None:
    normalized = {normalize_text(header): header for header in headers}
    for alias in HEADER_ALIASES[field]:
        if normalize_text(alias) in normalized:
            return normalized[normalize_text(alias)]
    for alias in HEADER_ALIASES[field]:
        normalized_alias = normalize_text(alias)
        for normalized_header, original_header in normalized.items():
            if normalized_alias and normalized_alias in normalized_header:
                return original_header
    return None


def value(row: dict[str, Any], headers: list[str], field: str) -> Any:
    header = header_for(headers, field)
    return row.get(header) if header else None


def price_currency(header: str | None, default_currency: str | None) -> str | None:
    normalized = normalize_text(header)
    if "ریال" in normalized or "rial" in normalized:
        return "IRR"
    if "تومان" in normalized or "toman" in normalized:
        return "TOMAN"
    if default_currency in {"IRR", "TOMAN"}:
        return default_currency
    return None


def price_payload(row: dict[str, Any], headers: list[str], source_url: str, observed_at: str, default_currency: str | None) -> tuple[dict[str, Any] | None, str | None]:
    header = header_for(headers, "price")
    amount = number(row.get(header)) if header else None
    if amount is None:
        return None, None
    currency = price_currency(header, default_currency)
    if not currency:
        return None, f"واحد پول ستون «{header}» مشخص نیست؛ IRR یا TOMAN باید صریح باشد."
    amount_toman = round(amount / 10 if currency == "IRR" else amount)
    return {
        "amountToman": amount_toman,
        "priceKind": "consumer_retail",
        "sourceAmount": amount,
        "sourceCurrency": currency,
        "effectiveAt": observed_at,
        "sourceUrl": source_url,
        "sourceReference": header,
    }, None


def coverage_payload(
    row: dict[str, Any],
    headers: list[str],
    provider: str,
    source_url: str,
    observed_at: str,
    default_currency: str | None,
) -> tuple[dict[str, Any] | None, str | None]:
    percent = number(value(row, headers, "coverage_percent"))
    insurer_share = number(value(row, headers, "insurer_share"))
    patient_share = number(value(row, headers, "patient_share"))
    reference_price = number(value(row, headers, "reference_price"))
    if percent is None and reference_price and insurer_share is not None:
        percent = round(insurer_share / reference_price * 100, 2)
    if percent is None:
        return None, "درصد پوشش یا مبنای محاسبه سهم بیمه در ردیف پیدا نشد."
    if not 0 <= percent <= 100:
        return None, f"درصد پوشش خارج از محدوده است: {percent}"
    money_values = [amount for amount in (insurer_share, patient_share, reference_price) if amount is not None]
    money_headers = [
        header_for(headers, field)
        for field in ("insurer_share", "patient_share", "reference_price")
        if number(value(row, headers, field)) is not None
    ]
    currencies = {price_currency(header, default_currency) for header in money_headers}
    if money_values and (None in currencies or len(currencies) != 1):
        return None, "واحد مبالغ سهم بیمار/بیمه باید صریح و برای این ردیف یکسان باشد."
    source_currency = next(iter(currencies)) if currencies else None
    to_toman = lambda amount: round(amount / 10 if source_currency == "IRR" else amount) if amount is not None else None
    return {
        "provider": provider,
        "percent": percent,
        "origin": "source",
        "genericCode": str(value(row, headers, "generic_code") or "").strip() or None,
        "brandCode": str(value(row, headers, "brand_code") or "").strip() or None,
        "insurerShareToman": to_toman(insurer_share),
        "patientShareToman": to_toman(patient_share),
        "referencePriceToman": to_toman(reference_price),
        "sourceCurrency": source_currency,
        "sourceInsurerShare": insurer_share,
        "sourcePatientShare": patient_share,
        "sourceReferencePrice": reference_price,
        "effectiveAt": observed_at,
        "sourceUrl": source_url,
        "sourceReference": "خروجی رسمی بیمه",
    }, None


def make_record(
    row: dict[str, Any],
    headers: list[str],
    source_url: str,
    observed_at: str,
    scope_entry: dict[str, Any],
) -> dict[str, Any] | None:
    generic_name = str(value(row, headers, "generic_name") or "").strip()
    brand_name = str(value(row, headers, "brand_name") or "").strip()
    if not generic_name:
        return None
    row_url = str(value(row, headers, "source_link") or source_url).strip()
    return {
        "genericName": scope_entry["canonicalName"],
        "genericRegistryCode": str(value(row, headers, "generic_code") or "").strip() or None,
        "brandName": brand_name or None,
        "brandRegistryCode": str(value(row, headers, "brand_code") or "").strip() or None,
        "dosageForm": str(value(row, headers, "dosage_form") or "").strip() or None,
        "strengthPresentation": str(value(row, headers, "strength") or "").strip() or None,
        "clinicalDomains": scope_entry["clinicalDomains"],
        "insuranceCoverages": [],
        "sourceUrl": row_url,
        "sourceReference": f"Iran FDA NFI · {generic_name}",
        "observedAt": observed_at,
        "matchConfidence": 1,
    }


def build_bundle(
    nfi_path: Path,
    insurance_path: Path,
    default_currency: str | None = None,
    scope_path: Path = DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    run_id = str(uuid.uuid4())
    observed_at = datetime.now(timezone.utc).isoformat()
    source_runs: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    diagnostics: list[str] = []

    try:
        scope = load_scope(scope_path)
    except Exception as exc:
        scope = []
        errors.append(f"Scope: {exc}")

    try:
        nfi_rows, nfi_headers, _ = workbook_rows(nfi_path)
        if not header_for(nfi_headers, "generic_name"):
            raise ValueError("ستون نام ژنریک در خروجی NFI شناخته نشد.")
        skipped_outside_scope = 0
        for row in nfi_rows:
            raw_generic_name = str(value(row, nfi_headers, "generic_name") or "").strip()
            scope_entry = match_scope(raw_generic_name, scope)
            if not scope_entry:
                skipped_outside_scope += 1
                continue
            record = make_record(
                row,
                nfi_headers,
                "https://irc.fda.gov.ir/nfi",
                observed_at,
                scope_entry,
            )
            if not record:
                continue
            price, warning = price_payload(row, nfi_headers, record["sourceUrl"], observed_at, default_currency)
            if warning:
                errors.append(f"NFI: {warning}")
            if price:
                record["price"] = price
            records.append(record)
        if not records:
            raise ValueError("هیچ ردیف NFI با فهرست مجاز دامنه دارویی تطبیق پیدا نکرد.")
        diagnostics.append(
            f"NFI: {len(records)} ردیف وارد و {skipped_outside_scope} ردیف خارج از دامنه رد شد."
        )
        source_runs.append({"sourceId": "iran_fda_nfi", "status": "succeeded" if not errors else "needs_review", "rowCount": len(nfi_rows), "startedAt": observed_at, "completedAt": observed_at, "sourceUrl": "https://irc.fda.gov.ir/nfi", "checksumSha256": sha256(nfi_path), "error": errors[0] if errors else None})
    except Exception as exc:
        errors.append(f"NFI: {exc}")
        source_runs.append({"sourceId": "iran_fda_nfi", "status": "failed", "startedAt": observed_at, "completedAt": observed_at, "sourceUrl": "https://irc.fda.gov.ir/nfi", "error": str(exc)})

    nfi_names = {normalize_text(record["genericName"]): record for record in records}
    for provider, meta in SOURCE_META.items():
        source_errors: list[str] = []
        try:
            rows, headers, sheet = workbook_rows(insurance_path, meta["sheet"])
            if not header_for(headers, "generic_name"):
                raise ValueError(f"ستون نام دارو در شیت «{sheet}» شناخته نشد.")
            emitted = 0
            skipped_outside_scope = 0
            for row in rows:
                raw_name = str(value(row, headers, "generic_name") or "").strip()
                scope_entry = match_scope(raw_name, scope)
                if not scope_entry:
                    skipped_outside_scope += 1
                    continue
                normalized = normalize_text(raw_name)
                exact = nfi_names.get(normalized)
                candidates = [entry for key, entry in nfi_names.items() if key and (key in normalized or normalized in key)] if not exact else [exact]
                base = exact or (candidates[0] if len(candidates) == 1 else None)
                coverage, coverage_error = coverage_payload(
                    row,
                    headers,
                    provider,
                    meta["url"],
                    observed_at,
                    default_currency,
                )
                if coverage_error:
                    source_errors.append(f"ردیف {emitted + 2}: {coverage_error}")
                    continue
                price, price_error = price_payload(row, headers, meta["url"], observed_at, default_currency)
                if price_error:
                    source_errors.append(f"ردیف {emitted + 2}: {price_error}")
                record = {
                    "genericName": base["genericName"] if base else scope_entry["canonicalName"],
                    "genericRegistryCode": base.get("genericRegistryCode") if base else None,
                    "brandName": str(value(row, headers, "brand_name") or "").strip() or None,
                    "brandRegistryCode": None,
                    "dosageForm": str(value(row, headers, "dosage_form") or "").strip() or None,
                    "strengthPresentation": str(value(row, headers, "strength") or "").strip() or None,
                    "clinicalDomains": scope_entry["clinicalDomains"],
                    "price": price,
                    "insuranceCoverages": [coverage] if coverage else [],
                    "sourceUrl": meta["url"],
                    "sourceReference": f"خروجی {meta['sheet']}",
                    "observedAt": observed_at,
                    "matchConfidence": 0.99 if exact else 0.92 if base else 0.4,
                }
                records.append({key: value for key, value in record.items() if value is not None})
                emitted += 1
            diagnostics.append(
                f"{meta['sheet']}: {emitted} ردیف وارد و {skipped_outside_scope} ردیف خارج از دامنه رد شد."
            )
            status = "succeeded" if not source_errors else "needs_review"
            source_runs.append({"sourceId": provider, "status": status, "rowCount": len(rows), "startedAt": observed_at, "completedAt": observed_at, "sourceUrl": meta["url"], "checksumSha256": sha256(insurance_path), "error": source_errors[0] if source_errors else None})
            errors.extend(f"{meta['sheet']}: {message}" for message in source_errors[:100])
        except Exception as exc:
            errors.append(f"{meta['sheet']}: {exc}")
            source_runs.append({"sourceId": provider, "status": "failed", "startedAt": observed_at, "completedAt": observed_at, "sourceUrl": meta["url"], "error": str(exc)})

    brand_count = len({(normalize_text(record["genericName"]), normalize_text(record.get("brandName"))) for record in records if record.get("brandName")})
    generic_count = len({normalize_text(record["genericName"]) for record in records})
    ambiguous_count = sum(1 for record in records if record.get("matchConfidence", 0) < 0.9)
    run_status = "ready_to_publish" if all(source["status"] == "succeeded" for source in source_runs) and not ambiguous_count else "needs_review"
    return {
        "schemaVersion": 1,
        "run": {
            "id": run_id,
            "schemaVersion": 1,
            "status": run_status,
            "startedAt": observed_at,
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "sources": source_runs,
            "summary": {
                "genericCount": generic_count,
                "brandCount": brand_count,
                "priceChangeCount": sum(1 for record in records if record.get("price")),
                "coverageChangeCount": sum(len(record.get("insuranceCoverages", [])) for record in records),
                "ambiguousMatchCount": ambiguous_count,
                "errorCount": len(errors),
            },
        },
        "records": records,
        "diagnostics": diagnostics + errors,
    }


def write_bundle(
    nfi_path: Path,
    insurance_path: Path,
    output_path: Path,
    default_currency: str | None = None,
    scope_path: Path = DEFAULT_SCOPE_PATH,
) -> dict[str, Any]:
    bundle = build_bundle(nfi_path, insurance_path, default_currency, scope_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    return bundle
