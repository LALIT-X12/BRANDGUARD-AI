import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app, get_mongo_store


class InMemoryMongoStore:
    """In-memory test double mirroring MongoDatasetStore's async contract."""

    def __init__(self) -> None:
        self.cases: dict[str, dict[str, Any]] = {}
        self.runs: list[dict[str, Any]] = []

    async def ping(self) -> bool:
        return True

    async def upsert_eval_case(self, case: dict[str, Any]) -> None:
        self.cases[case["case_id"]] = case

    async def list_eval_cases(
        self, *, category: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        rows = list(self.cases.values())
        if category:
            rows = [r for r in rows if r.get("category") == category]
        return rows[:limit]

    async def list_eval_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        return self.runs[:limit]


def test_seed_dataset_contains_only_real_compliance_cases() -> None:
    dataset_path = Path(__file__).resolve().parent.parent / "datasets" / "sample_eval_dataset.json"
    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    assert len(data["guidelines"]) >= 3
    assert len(data["claims"]) >= 2
    assert len(data["eval_cases"]) >= 4
    # Ensure no testimonial copy exists
    combined = json.dumps(data).lower()
    assert "testimonial" not in combined
    assert "improves productivity by 75%" not in combined


def test_dataset_endpoints_with_mongo_store() -> None:
    store = InMemoryMongoStore()
    app.dependency_overrides[get_mongo_store] = lambda: store
    try:
        with TestClient(app) as client:
            health = client.get("/health")
            assert health.status_code == 200
            assert health.json()["mongodb"] == "connected"

            post_resp = client.post(
                "/datasets/cases",
                json={
                    "case_id": "real-case-001",
                    "category": "claim",
                    "expected_issue": True,
                    "text": "Our platform includes an active 2024 SOC 2 Type II attestation for 2026.",
                    "channel": "web",
                    "audience": "enterprise",
                    "intent": "compliance disclosure",
                },
            )
            assert post_resp.status_code == 201

            list_resp = client.get("/datasets/cases?category=claim")
            assert list_resp.status_code == 200
            assert len(list_resp.json()) == 1
            assert list_resp.json()[0]["case_id"] == "real-case-001"
    finally:
        app.dependency_overrides.clear()

