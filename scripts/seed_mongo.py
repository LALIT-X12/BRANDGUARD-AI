import argparse
import asyncio
import json
from pathlib import Path

from app.clients.mongo_client import MongoDatasetStore


async def seed_database(file_path: Path) -> dict[str, int]:
    """Load real guidelines, claims, and evaluation cases from JSON into MongoDB."""
    raw = json.loads(file_path.read_text(encoding="utf-8"))
    store = MongoDatasetStore()
    await store.ensure_indexes()

    guidelines = raw.get("guidelines", [])
    claims = raw.get("claims", [])
    cases = raw.get("eval_cases", [])

    for rule in guidelines:
        await store.upsert_guideline(rule)
    for claim in claims:
        await store.upsert_claim(claim)
    for case in cases:
        await store.upsert_eval_case(case)

    await store.close()
    return {
        "guidelines_upserted": len(guidelines),
        "claims_upserted": len(claims),
        "eval_cases_upserted": len(cases),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed MongoDB with BrandGuard datasets.")
    default_file = Path(__file__).resolve().parent.parent / "datasets" / "sample_eval_dataset.json"
    parser.add_argument("--file", type=Path, default=default_file, help="Path to JSON dataset file")
    args = parser.parse_args()

    counts = asyncio.run(seed_database(args.file))
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()

