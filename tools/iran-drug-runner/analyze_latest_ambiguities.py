from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
RUNS_DIR = ROOT / "runs"


def latest_bundle() -> Path:
    candidates: list[Path] = []
    if RUNS_DIR.exists():
        for run_dir in RUNS_DIR.iterdir():
            if not run_dir.is_dir():
                continue
            for name in ("glymize-drug-bundle-fixed.json", "glymize-drug-bundle.json"):
                path = run_dir / "output" / name
                if path.exists():
                    candidates.append(path)
    if not candidates:
        raise FileNotFoundError("هیچ glymize-drug-bundle*.json در پوشه runs پیدا نشد.")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def source_id(record: dict) -> str:
    host = urlparse(str(record.get("sourceUrl") or "")).netloc.lower()
    if "irc.fda.gov.ir" in host:
        return "iran_fda_nfi"
    if "ihio.gov.ir" in host:
        return "health_insurance"
    if "esata.ir" in host:
        return "armed_forces"
    if "tamin.ir" in host:
        return "social_security"
    return host or "unknown"


def confidence_band(value: float) -> str:
    if value < 0.5:
        return "<0.50"
    if value < 0.75:
        return "0.50-0.74"
    if value < 0.9:
        return "0.75-0.89"
    return ">=0.90"


def main() -> None:
    path = latest_bundle()
    bundle = json.loads(path.read_text(encoding="utf-8"))
    records = list(bundle.get("records") or [])
    low = [record for record in records if float(record.get("matchConfidence", 1) or 0) < 0.9]

    print(f"BUNDLE: {path}")
    print(f"TOTAL RECORDS: {len(records)}")
    print(f"LOW-CONFIDENCE (<0.90): {len(low)}")
    print()

    by_source = Counter(source_id(record) for record in low)
    print("LOW-CONFIDENCE BY SOURCE")
    for key, count in by_source.most_common():
        print(f"  {key}: {count}")
    print()

    by_band = Counter(confidence_band(float(record.get("matchConfidence", 1) or 0)) for record in low)
    print("LOW-CONFIDENCE BY BAND")
    for key in ("<0.50", "0.50-0.74", "0.75-0.89", ">=0.90"):
        if by_band[key]:
            print(f"  {key}: {by_band[key]}")
    print()

    by_generic: dict[str, Counter[str]] = defaultdict(Counter)
    for record in low:
        by_generic[str(record.get("genericName") or "<missing>")][source_id(record)] += 1
    print("LOW-CONFIDENCE BY GENERIC")
    for generic, counts in sorted(by_generic.items(), key=lambda item: (-sum(item[1].values()), item[0])):
        details = ", ".join(f"{source}={count}" for source, count in counts.most_common())
        print(f"  {generic}: {sum(counts.values())} ({details})")
    print()

    print("FIRST 50 LOW-CONFIDENCE RECORDS")
    for index, record in enumerate(low[:50], start=1):
        print(
            f"[{index}] source={source_id(record)} conf={record.get('matchConfidence')} "
            f"generic={record.get('genericName')!r} brand={record.get('brandName')!r} "
            f"form={record.get('dosageForm')!r} strength={record.get('strengthPresentation')!r} "
            f"genericCode={record.get('genericRegistryCode')!r} brandCode={record.get('brandRegistryCode')!r} "
            f"ref={record.get('referencePresentationId')!r}"
        )


if __name__ == "__main__":
    main()
