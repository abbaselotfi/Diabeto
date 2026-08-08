import json
from pathlib import Path

CATALOG = Path("apps/web/public/data/admin-catalog.json")


def norm(value: object) -> str:
    return str(value or "").strip().lower().replace("-", " ").replace("_", " ")


def main() -> None:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))

    # A successful catalog commit is, by definition, published. Keep the persisted
    # run state aligned with the actual GitHub publication state.
    for run in data.get("updateRuns", []):
        if run.get("status") == "ready_to_publish":
            run["status"] = "published"

    data.setdefault("masterRegistry", [])
    data.setdefault("customPresentations", [])
    data.setdefault("customGenerics", [])
    data.setdefault("visibility", {})
    data.setdefault("insurance", {})
    data.setdefault("brands", {})
    data.setdefault("marketData", {})

    # Current retained NFI candidate can be classified from the approved
    # WorldDrug.xlsx row WD-0060 (Bromocriptine-QR). This migration promotes it
    # to the market list but deliberately leaves clinicalEngineEnabled=false.
    wd_bromocriptine = {
        "id": "WD-0060",
        "canonicalName": "Bromocriptine-QR",
        "persianName": "بروموکریپتین سریع‌رهش",
        "searchSynonyms": ["Cycloset", "bromocriptine QR"],
        "combination": False,
        "therapeuticAreas": ["Diabetes"],
        "drugClass": "Dopamine D2 agonist",
        "primaryIndications": ["Type 2 diabetes"],
        "guidelineRole": "Alternative low-efficacy agent",
        "diabetesOrPhenotype": "T2D",
        "clinicalEffects": [],
        "safetyMonitoring": "Nausea; orthostatic hypotension; syncope; psychiatric cautions",
        "sourceCodes": ["ADA9-2026"],
        "sourceUrls": ["https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment"],
        "sourceFile": "WorldDrug.xlsx",
        "sourceObservedAt": "2026-08-05",
        "reviewState": "approved",
    }
    if not any(entry.get("id") == "WD-0060" for entry in data["masterRegistry"]):
        data["masterRegistry"].append(wd_bromocriptine)

    remaining = []
    for candidate in data.get("masterCandidates", []):
        original = norm(candidate.get("originalGenericName"))
        generic = norm(candidate.get("genericName"))
        is_bromocriptine = generic == "bromocriptine" or original in {"bromocriptine qr", "bromocriptine"}
        if not is_bromocriptine:
            remaining.append(candidate)
            continue

        generic_id = "master-bromocriptine-qr"
        if not any(item.get("id") == generic_id for item in data["customGenerics"]):
            data["customGenerics"].append({
                "id": generic_id,
                "canonicalName": "Bromocriptine-QR",
                "persianName": "بروموکریپتین سریع‌رهش",
                "className": "Dopamine D2 agonist",
                "therapyGroup": "oral_glucose_lowering",
                "administrationRoute": "oral",
                "catalogStatus": "admin_added",
                "clinicalEngineEnabled": False,
                "masterRegistryId": "WD-0060",
            })

        registry = str(candidate.get("brandRegistryCode") or candidate.get("genericRegistryCode") or "wd0060")
        presentation_id = f"iran-master-{registry}"
        if not any(item.get("id") == presentation_id for item in data["customPresentations"]):
            data["customPresentations"].append({
                "id": presentation_id,
                "therapeuticClass": "Dopamine D2 agonist",
                "mechanismOrSubclass": "Alternative low-efficacy agent",
                "genericName": "Bromocriptine-QR / بروموکریپتین سریع‌رهش",
                "administrationRoute": "oral",
                "dosageForm": candidate.get("dosageForm") or "TABLET",
                "strengthPresentation": candidate.get("strengthPresentation") or "2.5 mg",
                "indicationScope": "Type 2 diabetes",
                "marketStatus": "Iran NFI verified",
                "sourceUrl": candidate.get("sourceUrl"),
                "coverageNotes": "Market identity verified from Iran FDA NFI. Clinical-engine activation is intentionally separate.",
                "sourceFile": "Iran FDA NFI / WorldDrug.xlsx",
                "sourceObservedAt": candidate.get("observedAt") or "2026-08-07",
                "reviewState": "validated_for_iran",
            })

        data["visibility"][presentation_id] = True
        data["insurance"][presentation_id] = candidate.get("insuranceCoverages") or []
        data["marketData"][presentation_id] = {
            "genericRegistryCode": candidate.get("genericRegistryCode"),
            "clinicalDomains": ["diabetes"],
            "price": candidate.get("price"),
            "sourceUrl": candidate.get("sourceUrl"),
            "sourceObservedAt": candidate.get("observedAt"),
            "updatedAt": "2026-08-08T04:00:00.000Z",
        }
        if candidate.get("brandName"):
            data["brands"][presentation_id] = [{
                "id": f"source-{registry}",
                "name": candidate["brandName"],
                "showInsteadOfGeneric": False,
                "priority": 1,
                "customInsurance": False,
                "insuranceCoverages": candidate.get("insuranceCoverages") or [],
                "genericRegistryCode": candidate.get("genericRegistryCode"),
                "brandRegistryCode": candidate.get("brandRegistryCode"),
                "price": candidate.get("price"),
                "sourceDiscovered": True,
                "sourceUrl": candidate.get("sourceUrl"),
                "sourceObservedAt": candidate.get("observedAt"),
                "hiddenFromSource": False,
            }]

    data["masterCandidates"] = remaining
    CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
