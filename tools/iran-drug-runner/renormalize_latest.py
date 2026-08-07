from __future__ import annotations

from pathlib import Path

from consensus_pipeline import write_bundle


ROOT = Path(__file__).resolve().parent
RUNS_DIR = ROOT / "runs"
NFI_PATH = ROOT / "input" / "nfi-latest.xlsx"


def latest_completed_source_run() -> Path:
    candidates: list[Path] = []
    if RUNS_DIR.exists():
        for run_dir in RUNS_DIR.iterdir():
            if not run_dir.is_dir():
                continue
            source_book = run_dir / "output" / "drug_sources_latest.xlsx"
            if source_book.exists():
                candidates.append(run_dir)
    if not candidates:
        raise FileNotFoundError("هیچ Run دارای output/drug_sources_latest.xlsx پیدا نشد.")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def main() -> None:
    if not NFI_PATH.exists():
        raise FileNotFoundError(f"فایل NFI پیدا نشد: {NFI_PATH}")

    run_dir = latest_completed_source_run()
    insurance_path = run_dir / "output" / "drug_sources_latest.xlsx"
    output_path = run_dir / "output" / "glymize-drug-bundle-fixed.json"

    bundle = write_bundle(NFI_PATH, insurance_path, output_path)

    print(f"RUN DIR: {run_dir}")
    print(f"RUN STATUS: {bundle['run']['status']}")
    print()
    for source in bundle["run"]["sources"]:
        print(
            f"{source['sourceId']} => {source['status']}"
            f" | rows: {source.get('rowCount')}"
            f" | error: {source.get('error')}"
        )
    print()
    print(f"SUMMARY: {bundle['run']['summary']}")
    print(f"CONSENSUS AUDIT: {len(bundle.get('standardizationAudit', []))}")
    print(f"OUTPUT: {output_path}")


if __name__ == "__main__":
    main()
