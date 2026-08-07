from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

SOURCE_IDS = (
    "iran_fda_nfi",
    "health_insurance",
    "armed_forces",
    "social_security",
)

DIGIT_TRANSLATION = str.maketrans({
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
})


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower().translate(DIGIT_TRANSLATION).replace("\u200c", " ")
    text = re.sub(r"[^a-z0-9آ-ی.]+", " ", text)
    return " ".join(text.split())


def normalize_generic_code(value: Any) -> str:
    text = str(value or "").strip().translate(DIGIT_TRANSLATION)
    text = re.sub(r"\s+", "", text)
    if not text:
        return ""
    if re.fullmatch(r"\d+", text):
        return str(int(text))
    return normalize_text(text)


def record_source_id(record: dict[str, Any]) -> str | None:
    coverages = record.get("insuranceCoverages") or []
    if len(coverages) == 1:
        provider = str(coverages[0].get("provider") or "")
        if provider in SOURCE_IDS:
            return provider
    source_url = str(record.get("sourceUrl") or "").lower()
    if "irc.fda.gov.ir" in source_url:
        return "iran_fda_nfi"
    return None


def record_generic_code(record: dict[str, Any]) -> str:
    coverages = record.get("insuranceCoverages") or []
    if len(coverages) == 1:
        code = normalize_generic_code(coverages[0].get("genericCode"))
        if code:
            return code
    return normalize_generic_code(record.get("genericRegistryCode"))


def _append_evidence(record: dict[str, Any], evidence: str) -> None:
    reference = str(record.get("sourceReference") or "").strip()
    if evidence not in reference:
        record["sourceReference"] = " · ".join(filter(None, [reference, evidence]))


def _source_name_votes(records: list[dict[str, Any]]) -> dict[str, tuple[str, str, list[str]]]:
    """Return one independent generic-name vote per source.

    If one source contains conflicting identities for the same generic code, that
    source abstains. Row count never increases voting weight.
    """
    per_source: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for record in records:
        source = record_source_id(record)
        if not source:
            continue
        name = str(record.get("genericName") or "").strip()
        normalized = normalize_text(name)
        if not normalized:
            continue
        bucket = per_source[source].setdefault(normalized, {
            "label": name,
            "domains": list(record.get("clinicalDomains") or []),
        })
        if not bucket["domains"] and record.get("clinicalDomains"):
            bucket["domains"] = list(record.get("clinicalDomains") or [])

    votes: dict[str, tuple[str, str, list[str]]] = {}
    for source, names in per_source.items():
        if len(names) != 1:
            continue
        normalized, info = next(iter(names.items()))
        votes[source] = (normalized, str(info["label"]), list(info["domains"]))
    return votes


def apply_identity_consensus(bundle: dict[str, Any]) -> dict[str, int]:
    """Standardize generic identity using independent-source consensus.

    Rules:
    - 3/4 (or 4/4) independent sources agreeing on a generic code may correct any
      dissenting source automatically.
    - 2 sources may correct exactly one dissenting source only when every record
      from that dissenting source is low-confidence (<0.90). This preserves the
      earlier safe recovery path for a bad NFI/search match while refusing a
      2-vs-1 disagreement between confident sources.
    - Two agreeing sources with no dissent may only fill confidence/evidence; they
      do not invent a missing identity.
    Raw provenance is retained in sourceReference/standardizationAudit.
    """
    by_code: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in bundle.get("records", []):
        code = record_generic_code(record)
        if code:
            by_code[code].append(record)

    corrected = 0
    upgraded = 0
    consensus_groups = 0
    audit = bundle.setdefault("standardizationAudit", [])

    for code, records in by_code.items():
        votes = _source_name_votes(records)
        if len(votes) < 2:
            continue
        counts = Counter(vote[0] for vote in votes.values())
        ranked = counts.most_common()
        if not ranked:
            continue
        top_name, top_count = ranked[0]
        if len(ranked) > 1 and ranked[1][1] == top_count:
            continue

        supporters = sorted(source for source, vote in votes.items() if vote[0] == top_name)
        dissenters = sorted(source for source, vote in votes.items() if vote[0] != top_name)
        strong = top_count >= 3
        low_confidence_single_dissent = False
        if top_count == 2 and len(dissenters) == 1:
            dissent_records = [record for record in records if record_source_id(record) == dissenters[0]]
            low_confidence_single_dissent = bool(dissent_records) and all(
                float(record.get("matchConfidence") or 0) < 0.9 for record in dissent_records
            )

        if not strong and not low_confidence_single_dissent and dissenters:
            continue

        exemplar = next(vote for vote in votes.values() if vote[0] == top_name)
        canonical_label = exemplar[1]
        domains = exemplar[2]
        evidence = f"four-source identity consensus code {code} ({', '.join(supporters)})"
        group_changed = False

        for record in records:
            source = record_source_id(record)
            current = normalize_text(record.get("genericName"))
            may_correct = strong or (low_confidence_single_dissent and source in dissenters)
            if current != top_name and may_correct:
                original = record.get("genericName")
                record["genericName"] = canonical_label
                if domains:
                    record["clinicalDomains"] = list(domains)
                record["matchConfidence"] = max(float(record.get("matchConfidence") or 0), 0.995 if strong else 0.98)
                _append_evidence(record, evidence)
                audit.append({
                    "kind": "generic_identity_consensus",
                    "genericCode": code,
                    "sourceId": source,
                    "from": original,
                    "to": canonical_label,
                    "supportingSources": supporters,
                    "quorum": top_count,
                })
                corrected += 1
                group_changed = True
            elif current == top_name:
                target_confidence = 0.995 if strong else 0.98
                if float(record.get("matchConfidence") or 0) < target_confidence:
                    record["matchConfidence"] = target_confidence
                    upgraded += 1
                _append_evidence(record, evidence)

        if group_changed or top_count >= 3:
            consensus_groups += 1

    return {
        "identityConsensusGroups": consensus_groups,
        "identityCorrections": corrected,
        "identityConfidenceUpgrades": upgraded,
    }


def apply_reference_consensus(records: list[dict[str, Any]]) -> dict[str, int]:
    """Propagate/correct referencePresentationId by source consensus.

    The vote is keyed by canonical generic name + generic code. Each of the four
    official sources has at most one vote regardless of row/brand count.

    - 3+ agreeing sources can correct a single outlier and fill missing IDs.
    - 2 agreeing sources can fill missing IDs only when no other source has a
      contradictory resolved presentation.
    - Conflicts without a quorum remain unresolved and therefore block publish.
    """
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        code = record_generic_code(record)
        generic = normalize_text(record.get("genericName"))
        if code and generic:
            groups[(generic, code)].append(record)

    filled = 0
    corrected = 0
    consensus_groups = 0

    for (generic, code), group in groups.items():
        per_source: dict[str, set[str]] = defaultdict(set)
        for record in group:
            source = record_source_id(record)
            reference_id = str(record.get("referencePresentationId") or "").strip()
            if source and reference_id:
                per_source[source].add(reference_id)

        votes = {
            source: next(iter(ids))
            for source, ids in per_source.items()
            if len(ids) == 1
        }
        if len(votes) < 2:
            continue
        counts = Counter(votes.values())
        ranked = counts.most_common()
        if not ranked:
            continue
        best_id, best_count = ranked[0]
        if len(ranked) > 1 and ranked[1][1] == best_count:
            continue
        supporters = sorted(source for source, value in votes.items() if value == best_id)
        conflicting_sources = sorted(source for source, value in votes.items() if value != best_id)
        strong = best_count >= 3
        fill_only = best_count >= 2 and not conflicting_sources
        if not strong and not fill_only:
            continue

        evidence = f"four-source presentation consensus code {code} ({', '.join(supporters)})"
        changed = False
        for record in group:
            current = str(record.get("referencePresentationId") or "").strip()
            if not current:
                record["referencePresentationId"] = best_id
                _append_evidence(record, evidence)
                filled += 1
                changed = True
            elif current != best_id and strong:
                record["referencePresentationId"] = best_id
                _append_evidence(record, evidence)
                corrected += 1
                changed = True
        if changed:
            consensus_groups += 1

    return {
        "presentationConsensusGroups": consensus_groups,
        "presentationIdsFilled": filled,
        "presentationIdsCorrected": corrected,
    }
